/**
 * Historical import of the DWD Google Spreadsheet (read-only; the sheet is never modified).
 *
 *   npm run import:sheet -- --dry-run          parse + reconcile only, no database writes
 *   npm run import:sheet                        import into Supabase (idempotent)
 *   npm run import:sheet -- --source-dir DIR    use previously downloaded files instead of the web
 *   npm run import:sheet -- --csv FILE.csv      CSV fallback (same columns as the INOUT sheet)
 *   npm run import:sheet -- --no-images         skip receipt images
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (server-side only) unless --dry-run.
 * Re-running is safe: rows already imported are recognised by their sheet row reference and
 * content hash and are never duplicated or overwritten.
 */
import "dotenv/config";
import { config as loadEnv } from "dotenv";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { parseCsv } from "../src/lib/csv";
import {
  parseLedger,
  parseSummarySheet,
  reconcile,
  type LedgerParseResult,
  type Reconciliation,
} from "../src/lib/import/ledger";
import { extractAnchoredImages, extractMerges, type AnchoredImage } from "../src/lib/import/xlsx-images";
import { centsToDecimal, dbToCents, formatMoney } from "../src/lib/money";

loadEnv({ path: ".env.local" });

const PUBLISHED_ID =
  process.env.SHEET_PUBLISHED_ID ??
  "2PACX-1vT4mUtPHMK1oWXl7l5PNPUvSwxktl2oavqDDiqNwi6Bn3fK50gJNRf3Y-I2uaMW2nWwpWrRxrXACwl2";
const LEDGER_GID = process.env.SHEET_LEDGER_GID ?? "884284817";
const SUMMARY_GID = process.env.SHEET_SUMMARY_GID ?? "946165812";
const LEDGER_SHEET = "INOUT";
const BASE = `https://docs.google.com/spreadsheets/d/e/${PUBLISHED_ID}`;

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(n);
const opt = (n: string) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};
const DRY = flag("--dry-run");
const NO_IMAGES = flag("--no-images");
const SOURCE_DIR = opt("--source-dir");
const CSV_FILE = opt("--csv");

async function download(url: string): Promise<Uint8Array> {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`Download failed (${res.status}) for ${url}`);
  return new Uint8Array(await res.arrayBuffer());
}

interface Sources {
  ledgerCsv: string;
  summaryCsv: string | null;
  xlsx: Uint8Array | null;
  origin: string;
}

async function loadSources(snapshotDir: string): Promise<Sources> {
  if (CSV_FILE) {
    return { ledgerCsv: readFileSync(CSV_FILE, "utf8"), summaryCsv: null, xlsx: null, origin: resolve(CSV_FILE) };
  }
  if (SOURCE_DIR) {
    const xlsxPath = join(SOURCE_DIR, "book.xlsx");
    const summaryPath = join(SOURCE_DIR, "summary.csv");
    return {
      ledgerCsv: readFileSync(join(SOURCE_DIR, "inout.csv"), "utf8"),
      summaryCsv: existsSync(summaryPath) ? readFileSync(summaryPath, "utf8") : null,
      xlsx: existsSync(xlsxPath) ? new Uint8Array(readFileSync(xlsxPath)) : null,
      origin: resolve(SOURCE_DIR),
    };
  }
  console.log("Downloading published spreadsheet (read-only)…");
  const dec = new TextDecoder();
  const ledgerCsv = dec.decode(await download(`${BASE}/pub?gid=${LEDGER_GID}&single=true&output=csv`));
  const summaryCsv = dec.decode(await download(`${BASE}/pub?gid=${SUMMARY_GID}&single=true&output=csv`));
  // The xlsx export is needed even without images: it carries the merged-cell structure.
  const xlsx = await download(`${BASE}/pub?output=xlsx`);
  // Keep an exact snapshot of what was imported, for traceability.
  mkdirSync(snapshotDir, { recursive: true });
  writeFileSync(join(snapshotDir, "inout.csv"), ledgerCsv);
  writeFileSync(join(snapshotDir, "summary.csv"), summaryCsv);
  if (xlsx) writeFileSync(join(snapshotDir, "book.xlsx"), xlsx);
  return { ledgerCsv, summaryCsv, xlsx, origin: BASE + "/pubhtml" };
}

interface ImageOutcome {
  cell: string;
  row: number;
  sourceRef: string;
  outcome: string;
  detail?: string;
}

function md(s: string | null | undefined) {
  return (s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
}

async function main() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportDir = resolve("import-reports");
  const snapshotDir = join(reportDir, "snapshots", stamp);
  mkdirSync(reportDir, { recursive: true });

  const src = await loadSources(snapshotDir);
  const source = CSV_FILE ? "csv_import" : "sheet_import";
  const refPrefix = CSV_FILE ? `csv:${basename(CSV_FILE)}` : "gsheet";

  const merges = src.xlsx ? extractMerges(src.xlsx, LEDGER_SHEET) : [];
  if (!CSV_FILE && !src.xlsx) {
    console.warn("WARNING: no xlsx available – merged cells cannot be expanded; blank cells will be treated as blank.");
  }
  const parsed: LedgerParseResult = parseLedger(parseCsv(src.ledgerCsv), {
    sheetName: CSV_FILE ? "CSV" : LEDGER_SHEET,
    refPrefix,
    merges,
  });
  const expected = src.summaryCsv ? parseSummarySheet(parseCsv(src.summaryCsv)) : {};
  if (parsed.footerBalanceCents !== null && expected.balanceCents === undefined) {
    expected.balanceCents = parsed.footerBalanceCents;
  }
  const sourceRecon: Reconciliation = reconcile(parsed.transactions, expected);
  const footerOk =
    parsed.footerBalanceCents === null || parsed.footerBalanceCents === sourceRecon.balanceCents;

  const images: AnchoredImage[] = src.xlsx && !NO_IMAGES ? extractAnchoredImages(src.xlsx, LEDGER_SHEET) : [];
  const byRow = new Map(parsed.transactions.map((t) => [t.sourceRow, t]));

  console.log(
    `Parsed ${parsed.transactions.length} transactions, ${parsed.errors.length} problem rows, ` +
      `${parsed.skipped.length} non-data rows, ${images.length} embedded images.`,
  );

  // ---------------------------------------------------------------- database
  const dbOutcomes: { source_ref: string; outcome: string; transaction_id: string; detail: string | null }[] = [];
  const imageOutcomes: ImageOutcome[] = [];
  let dbRecon: Reconciliation | null = null;

  if (!DRY) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error(
        "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (in .env.local) – or use --dry-run.",
      );
    }
    const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

    const payload = parsed.transactions.map((t) => ({
      source_ref: t.sourceRef,
      source_row: t.sourceRow,
      source_hash: t.sourceHash,
      source_raw: t.sourceRaw,
      txn_date: t.txnDate,
      date_inferred: t.dateInferred,
      type: t.type,
      amount: centsToDecimal(t.amountCents),
      description: t.description,
      category: t.category,
      category_inferred: t.categoryInferred,
      payment_method: t.paymentMethod,
      payment_method_detail: t.paymentMethodDetail,
      paid_by: t.paidBy,
      paid_to: t.paidTo,
      notes: t.notes,
    }));
    // One RPC call = one database transaction: all rows import or none do.
    const { data, error } = await db.rpc("import_transactions", { p_source: source, p_rows: payload });
    if (error) throw new Error(`Import RPC failed (nothing was written): ${error.message}`);
    dbOutcomes.push(...(data as typeof dbOutcomes));
    const idByRef = new Map(dbOutcomes.map((o) => [o.source_ref, o.transaction_id]));

    // Receipt images → private storage + attachments rows (idempotent by source_ref).
    for (const img of images) {
      const sourceRef = `gsheet:${LEDGER_SHEET}!${img.cell}`;
      const txn = byRow.get(img.row);
      if (!txn) {
        imageOutcomes.push({ cell: img.cell, row: img.row, sourceRef, outcome: "orphan", detail: "No transaction on this row" });
        continue;
      }
      const txnId = idByRef.get(txn.sourceRef);
      const dbo = dbOutcomes.find((o) => o.source_ref === txn.sourceRef);
      if (!txnId || dbo?.outcome === "duplicate_content") {
        imageOutcomes.push({ cell: img.cell, row: img.row, sourceRef, outcome: "skipped", detail: `Transaction outcome: ${dbo?.outcome}` });
        continue;
      }
      const { data: existing } = await db.from("attachments").select("id").eq("source_ref", sourceRef).maybeSingle();
      if (existing) {
        imageOutcomes.push({ cell: img.cell, row: img.row, sourceRef, outcome: "already_imported" });
        continue;
      }
      const ext = img.fileName.split(".").pop()!.toLowerCase();
      const digest = createHash("sha256").update(img.bytes).digest("hex").slice(0, 12);
      const path = `${txnId}/sheet-${img.cell}-${digest}.${ext}`;
      const up = await db.storage.from("receipts").upload(path, img.bytes, {
        contentType: img.mimeType,
        upsert: true,
      });
      if (up.error) {
        imageOutcomes.push({ cell: img.cell, row: img.row, sourceRef, outcome: "failed", detail: up.error.message });
        continue;
      }
      const ins = await db.from("attachments").insert({
        transaction_id: txnId,
        storage_path: path,
        file_name: `Receipt ${img.cell}.${ext}`,
        mime_type: img.mimeType,
        size_bytes: img.bytes.byteLength,
        source_ref: sourceRef,
        uploaded_by: null,
      });
      if (ins.error) {
        imageOutcomes.push({ cell: img.cell, row: img.row, sourceRef, outcome: "failed", detail: ins.error.message });
        continue;
      }
      imageOutcomes.push({
        cell: img.cell,
        row: img.row,
        sourceRef,
        outcome: "imported",
        detail: img.mergedRange ? `Cell is merged (${img.mergedRange}); attached to row ${img.row} only` : undefined,
      });
    }

    // Reconcile what is now in the database for this source.
    const { data: rows, error: e2 } = await db
      .from("transactions")
      .select("type, amount")
      .eq("source", source)
      .like("source_ref", `${refPrefix}:%`);
    if (e2) throw new Error(e2.message);
    dbRecon = reconcile(
      (rows ?? []).map((r) => ({ type: r.type as "in" | "out", amountCents: dbToCents(r.amount as string) })),
      expected,
    );
  } else {
    for (const img of images) {
      const txn = byRow.get(img.row);
      imageOutcomes.push({
        cell: img.cell,
        row: img.row,
        sourceRef: `gsheet:${LEDGER_SHEET}!${img.cell}`,
        outcome: txn ? "would_import" : "orphan",
        detail: img.mergedRange ? `Cell is merged (${img.mergedRange}); attached to row ${img.row} only` : txn ? undefined : "No transaction on this row",
      });
    }
  }

  // ---------------------------------------------------------------- report
  const count = (o: string) => dbOutcomes.filter((d) => d.outcome === o).length;
  const imgCount = (o: string) => imageOutcomes.filter((d) => d.outcome === o).length;
  const warnRows = parsed.transactions.filter((t) => t.warnings.some((w) => !w.startsWith("Date blank")));
  const uncategorised = parsed.transactions.filter((t) => !t.category);
  const L: string[] = [];
  L.push(`# Import report — ${new Date().toISOString()}`, "");
  L.push(`- Mode: **${DRY ? "dry run (no database writes)" : "import"}**`);
  L.push(`- Source: ${src.origin}`, `- Source type: \`${source}\``);
  if (!SOURCE_DIR && !CSV_FILE) L.push(`- Snapshot of downloaded files: \`import-reports/snapshots/${stamp}/\``);
  L.push("", "## Summary", "");
  L.push(`| Item | Count |`, `|---|---|`);
  L.push(`| Data rows parsed as transactions | ${parsed.transactions.length} |`);
  if (!DRY) {
    L.push(`| Newly imported | ${count("imported")} |`);
    L.push(`| Already imported earlier (skipped, no duplicate) | ${count("already_imported")} |`);
    L.push(`| Changed in sheet since import (NOT overwritten) | ${count("changed_in_source")} |`);
    L.push(`| Same content as another imported row (skipped) | ${count("duplicate_content")} |`);
  }
  L.push(`| Problem rows NOT imported (need manual fix) | ${parsed.errors.length} |`);
  L.push(`| Non-data rows skipped (titles, header, blank, footer) | ${parsed.skipped.length} |`);
  L.push(`| Embedded receipt images found | ${images.length} |`);
  if (!DRY) {
    L.push(`| Receipt images imported now | ${imgCount("imported")} |`);
    L.push(`| Receipt images already imported | ${imgCount("already_imported")} |`);
    L.push(`| Receipt images failed | ${imgCount("failed")} |`);
  }
  L.push(`| Receipt images with no transaction on their row | ${imgCount("orphan")} |`);
  L.push("", "## Reconciliation", "");
  const reconTable = (title: string, r: Reconciliation) => {
    L.push(`**${title}**`, "", `| Check | Expected (sheet) | Actual | Result |`, `|---|---|---|---|`);
    L.push(`| Total received | ${fmt(r.expected.totalInCents)} | ${formatMoney(r.totalInCents)} | ${ok(r.expected.totalInCents, r.totalInCents)} |`);
    L.push(`| Total spent | ${fmt(r.expected.totalOutCents)} | ${formatMoney(r.totalOutCents)} | ${ok(r.expected.totalOutCents, r.totalOutCents)} |`);
    L.push(`| Remaining balance | ${fmt(r.expected.balanceCents)} | ${formatMoney(r.balanceCents)} | ${ok(r.expected.balanceCents, r.balanceCents)} |`);
    L.push(`| Transaction count | – | ${r.count} | |`, "");
  };
  const fmt = (c: number | null | undefined) => (c === null || c === undefined ? "n/a" : formatMoney(c));
  const ok = (e: number | null | undefined, a: number) => (e === null || e === undefined ? "–" : e === a ? "✅ match" : "❌ MISMATCH");
  reconTable("Parsed rows vs the sheet's Summary tab", sourceRecon);
  if (parsed.footerBalanceCents !== null) {
    L.push(`Sheet footer "Remaining Total": ${formatMoney(parsed.footerBalanceCents)} — ${footerOk ? "✅ matches" : "❌ does not match"} parsed balance.`, "");
  }
  if (dbRecon) reconTable("Database contents (this source) vs the sheet", dbRecon);

  L.push("## Problem rows (not imported)", "");
  if (!parsed.errors.length) L.push("None.", "");
  else {
    L.push("| Row | Reason | Raw cells |", "|---|---|---|");
    for (const e of parsed.errors) L.push(`| ${e.row} | ${md(e.reason)} | ${md(e.raw.join(" · "))} |`);
    L.push("");
  }
  const changed = dbOutcomes.filter((d) => d.outcome !== "imported" && d.outcome !== "already_imported");
  if (changed.length) {
    L.push("## Rows needing attention on re-import", "", "| Source ref | Outcome | Detail |", "|---|---|---|");
    for (const c of changed) L.push(`| ${c.source_ref} | ${c.outcome} | ${md(c.detail)} |`);
    L.push("");
  }
  L.push("## Imported with incomplete source data (imported as-is, nothing invented)", "");
  L.push("| Row | Date | Amount | Description | Issues |", "|---|---|---|---|---|");
  for (const t of warnRows) {
    L.push(
      `| ${t.sourceRow} | ${t.txnDate} | ${formatMoney(t.type === "in" ? t.amountCents : -t.amountCents)} | ${md(t.description) || "_(blank)_"} | ${md(t.warnings.filter((w) => !w.startsWith("Date blank")).join("; "))} |`,
    );
  }
  const mergedRows = parsed.transactions.filter((t) => t.sourceRaw.merged_from);
  L.push("", `Merged cells expanded (value shared with the row above in the sheet): ${merges.length} ranges; rows affected: ${mergedRows.map((t) => `${t.sourceRow} (${Object.entries(t.sourceRaw.merged_from!).map(([k, v]) => `${k} ${v}`).join(", ")})`).join("; ") || "none"}.`);
  L.push("", `Rows whose blank date was carried down from the row above: ${parsed.transactions.filter((t) => t.dateInferred).map((t) => t.sourceRow).join(", ") || "none"}.`, "");
  L.push("## Category suggestions", "");
  L.push("The sheet has no category column. Categories below were suggested from each description by fixed keyword rules and are flagged *auto* in the app so they can be reviewed. Rows that matched no rule are left **Uncategorised**.", "");
  L.push("| Row | Type | Amount | Description | Paid to | Category |", "|---|---|---|---|---|---|");
  for (const t of parsed.transactions) {
    L.push(`| ${t.sourceRow} | ${t.type} | ${formatMoney(t.amountCents)} | ${md(t.description) || "_(blank)_"} | ${md(t.paidTo)} | ${t.category ?? "**Uncategorised**"} |`);
  }
  L.push("", `Uncategorised rows: ${uncategorised.map((t) => t.sourceRow).join(", ") || "none"}.`, "");
  L.push("## Receipt images", "", "| Cell | Row | Outcome | Detail |", "|---|---|---|---|");
  for (const i of imageOutcomes) L.push(`| ${i.cell} | ${i.row} | ${i.outcome} | ${md(i.detail)} |`);
  L.push("", "## Skipped non-data rows", "");
  const blank = parsed.skipped.filter((s) => s.reason === "Blank row").map((s) => s.row);
  for (const s of parsed.skipped.filter((s) => s.reason !== "Blank row")) L.push(`- Row ${s.row}: ${s.reason}`);
  if (blank.length) L.push(`- Blank rows (${blank.length}): ${blank.join(", ")}`);

  const base = join(reportDir, `import-${DRY ? "dryrun-" : ""}${stamp}`);
  writeFileSync(`${base}.md`, L.join("\n") + "\n");
  writeFileSync(
    `${base}.json`,
    JSON.stringify(
      { mode: DRY ? "dry-run" : "import", source, parsed: { ...parsed, transactions: parsed.transactions }, sourceRecon, dbRecon, dbOutcomes, imageOutcomes },
      null,
      2,
    ),
  );

  console.log("");
  for (const c of sourceRecon.checks) {
    console.log(`  ${c.ok ? "OK " : "BAD"} ${c.name}: expected ${formatMoney(c.expectedCents)}, got ${formatMoney(c.actualCents)}`);
  }
  if (dbRecon) {
    console.log("  Database:");
    for (const c of dbRecon.checks) {
      console.log(`  ${c.ok ? "OK " : "BAD"} ${c.name}: expected ${formatMoney(c.expectedCents)}, got ${formatMoney(c.actualCents)}`);
    }
    console.log(`  Transactions: imported ${count("imported")}, already present ${count("already_imported")}, changed ${count("changed_in_source")}, duplicate ${count("duplicate_content")}`);
    console.log(`  Receipts: imported ${imgCount("imported")}, already present ${imgCount("already_imported")}, failed ${imgCount("failed")}`);
  }
  console.log(`\nReport written to ${base}.md`);

  const failed =
    parsed.errors.length > 0 ||
    !footerOk ||
    (sourceRecon.checks.length > 0 && !sourceRecon.ok) ||
    (dbRecon !== null && dbRecon.checks.length > 0 && !dbRecon.ok) ||
    imgCount("failed") > 0;
  if (failed) {
    console.error("\nATTENTION: see the report — some rows/images need manual review or totals do not reconcile.");
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
