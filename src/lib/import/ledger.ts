// Parser for the DWD "INOUT" ledger layout:
//   Date | In/Out | Purpose | Payment method | Paid by | Paid to | (note)
// A positive In/Out amount is money received, a negative one money spent.
// A blank Date means "same day as the row above" (the sheet's convention).
//
// Nothing is dropped silently: every non-empty row ends up either as a parsed
// transaction or in `errors`/`skipped` with a reason.

import { createHash } from "node:crypto";
import { parseAmountToCents, type TxnType } from "../money";
import { suggestCategory } from "./categorize";
import { parseCellRef } from "./xlsx-images";

export type PaymentMethod = "cash" | "online" | "card" | "mixed" | "other";

export interface RawLedgerRow {
  date: string;
  amount: string;
  purpose: string;
  payment_method: string;
  paid_by: string;
  paid_to: string;
  note: string;
  /** Fields whose value comes from a merged cell spanning several rows, e.g. { purpose: "C29:C30" } */
  merged_from?: Record<string, string>;
}

export interface ParsedTransaction {
  sourceRef: string;
  sourceRow: number;
  sourceHash: string;
  sourceRaw: RawLedgerRow;
  txnDate: string; // YYYY-MM-DD
  dateInferred: boolean;
  type: TxnType;
  amountCents: number; // positive
  description: string | null;
  paymentMethod: PaymentMethod | null;
  paymentMethodDetail: string | null;
  paidBy: string | null;
  paidTo: string | null;
  notes: string | null;
  category: string | null;
  categoryInferred: boolean;
  warnings: string[];
}

export interface RowIssue {
  row: number;
  reason: string;
  raw: string[];
}

export interface LedgerParseResult {
  transactions: ParsedTransaction[];
  /** Rows deliberately not imported (headers, blank rows, footer totals) */
  skipped: RowIssue[];
  /** Rows that look like data but could not be parsed — must be fixed by hand */
  errors: RowIssue[];
  /** Value of the sheet's own "Remaining Total" footer, if present */
  footerBalanceCents: number | null;
}

const FIELDS = ["date", "amount", "purpose", "payment_method", "paid_by", "paid_to", "note"] as const;

/**
 * Spreadsheet CSV exports only put a merged cell's value in its top-left cell.
 * Copy it into every cell of the range so each row carries its real value.
 * Returns the filled grid plus which (row,col) cells were filled and from which range.
 */
export function expandMerges(
  rows: string[][],
  merges: string[],
): { rows: string[][]; filled: Map<string, string> } {
  const out = rows.map((r) => [...r]);
  const filled = new Map<string, string>();
  for (const range of merges) {
    const [a, b] = range.split(":");
    const tl = parseCellRef(a);
    const br = parseCellRef(b);
    const value = out[tl.row - 1]?.[tl.col] ?? "";
    for (let r = tl.row; r <= br.row; r++) {
      for (let c = tl.col; c <= br.col; c++) {
        if (r === tl.row && c === tl.col) continue;
        if (!out[r - 1]) continue;
        while (out[r - 1].length <= c) out[r - 1].push("");
        if ((out[r - 1][c] ?? "").trim() === "") {
          out[r - 1][c] = value;
          if (value.trim()) filled.set(`${r}:${c}`, range);
        }
      }
    }
  }
  return { rows: out, filled };
}

const clean = (s: string | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
const orNull = (s: string) => (s ? s : null);

/** Parse M/D/YYYY (the sheet's format) or YYYY-MM-DD; validates the calendar date. */
export function parseSheetDate(input: string): string | null {
  const s = input.trim();
  let y: number, m: number, d: number;
  let match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (match) {
    [m, d, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else if ((match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s))) {
    [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else {
    return null;
  }
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  if (y < 2000 || y > 2100) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function normalisePaymentMethod(raw: string): {
  method: PaymentMethod | null;
  detail: string | null;
} {
  const s = clean(raw);
  if (!s) return { method: null, detail: null };
  const l = s.toLowerCase();
  if (l === "cash") return { method: "cash", detail: null };
  if (l === "online" || l === "bank" || l === "bank transfer") return { method: "online", detail: l === "online" ? null : s };
  if (l === "card") return { method: "card", detail: null };
  const hasCash = /\bcash\b/.test(l);
  const hasBank = /\b(online|bank|transfer)\b/.test(l);
  if (hasCash && hasBank) return { method: "mixed", detail: s };
  return { method: "other", detail: s };
}

function findHeader(rows: string[][]): number {
  return rows.findIndex(
    (r) => clean(r[0]).toLowerCase() === "date" && /in\s*\/\s*out/i.test(clean(r[1])),
  );
}

export function parseLedger(
  rows: string[][],
  opts: { sheetName: string; refPrefix?: string; merges?: string[] },
): LedgerParseResult {
  const refPrefix = opts.refPrefix ?? "gsheet";
  const originalRows = rows;
  const expanded = expandMerges(rows, opts.merges ?? []);
  rows = expanded.rows;
  const result: LedgerParseResult = { transactions: [], skipped: [], errors: [], footerBalanceCents: null };
  const headerIdx = findHeader(rows);
  if (headerIdx < 0) {
    throw new Error('Header row not found (expected "Date, In/Out, Purpose, …")');
  }
  for (let i = 0; i <= headerIdx; i++) {
    result.skipped.push({ row: i + 1, reason: i === headerIdx ? "Column header row" : "Title row", raw: rows[i] });
  }

  let lastDate: string | null = null;
  const seenHashes = new Map<string, number>();

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const rowNo = i + 1; // spreadsheet row numbers are 1-based
    const cells = rows[i];
    const orig = originalRows[i] ?? [];
    // sourceRaw keeps the cells exactly as exported; merged values are listed separately.
    const raw: RawLedgerRow = {
      date: orig[0] ?? "",
      amount: orig[1] ?? "",
      purpose: orig[2] ?? "",
      payment_method: orig[3] ?? "",
      paid_by: orig[4] ?? "",
      paid_to: orig[5] ?? "",
      note: orig[6] ?? "",
    };
    const mergedFrom: Record<string, string> = {};
    FIELDS.forEach((f, c) => {
      const range = expanded.filled.get(`${rowNo}:${c}`);
      if (range) mergedFrom[f] = range;
    });
    if (Object.keys(mergedFrom).length) raw.merged_from = mergedFrom;
    const val = {
      date: cells[0] ?? "",
      amount: cells[1] ?? "",
      purpose: cells[2] ?? "",
      payment_method: cells[3] ?? "",
      paid_by: cells[4] ?? "",
      paid_to: cells[5] ?? "",
      note: cells[6] ?? "",
    };
    const extra = cells.slice(7).map(clean).filter(Boolean);

    if (cells.every((c) => !clean(c))) {
      result.skipped.push({ row: rowNo, reason: "Blank row", raw: cells });
      continue;
    }
    if (/total/i.test(clean(val.date)) && !parseSheetDate(clean(val.date))) {
      const v = parseAmountToCents(clean(val.amount));
      if (/remaining/i.test(val.date)) result.footerBalanceCents = v;
      result.skipped.push({ row: rowNo, reason: `Summary/footer row ("${clean(val.date)}")`, raw: cells });
      continue;
    }

    const warnings: string[] = [];
    if (extra.length) warnings.push(`Unexpected extra cell values: ${extra.join(" | ")}`);

    // Amount
    const cents = parseAmountToCents(clean(val.amount));
    if (cents === null) {
      result.errors.push({
        row: rowNo,
        reason: clean(val.amount) ? `Unreadable amount "${clean(val.amount)}"` : "Amount is blank",
        raw: cells,
      });
      continue;
    }
    if (cents === 0) {
      result.errors.push({ row: rowNo, reason: "Amount is zero", raw: cells });
      continue;
    }

    // Date
    let txnDate: string | null;
    let dateInferred = false;
    if (clean(val.date)) {
      txnDate = parseSheetDate(clean(val.date));
      if (!txnDate) {
        result.errors.push({ row: rowNo, reason: `Unreadable date "${clean(val.date)}"`, raw: cells });
        continue;
      }
      if (lastDate && txnDate < lastDate) {
        warnings.push(`Date ${txnDate} is earlier than the row above (${lastDate}); kept as written`);
      }
      lastDate = txnDate;
    } else if (lastDate) {
      txnDate = lastDate;
      dateInferred = true;
      warnings.push("Date blank in sheet – same day as the row above");
    } else {
      result.errors.push({ row: rowNo, reason: "Date is blank and there is no earlier date to carry down", raw: cells });
      continue;
    }

    const type: TxnType = cents > 0 ? "in" : "out";
    const description = orNull(clean(val.purpose));
    const { method, detail } = normalisePaymentMethod(val.payment_method);
    const paidBy = orNull(clean(val.paid_by));
    const paidTo = orNull(clean(val.paid_to));
    const notes = orNull(clean(val.note));

    if (!description) warnings.push("No description in sheet");
    if (!method) warnings.push("No payment method in sheet");
    if (method === "mixed" || method === "other") warnings.push(`Payment method recorded as "${detail}"`);
    if (!paidBy) warnings.push("No 'Paid by' in sheet");
    if (!paidTo) warnings.push("No 'Paid to' in sheet");

    const category = suggestCategory(type, description, paidTo);

    // Content hash (+ occurrence counter for genuinely identical rows).
    const base = createHash("sha256")
      .update(JSON.stringify([txnDate, cents, description, method, detail, paidBy, paidTo, notes]))
      .digest("hex")
      .slice(0, 32);
    const n = (seenHashes.get(base) ?? 0) + 1;
    seenHashes.set(base, n);
    const sourceHash = n === 1 ? base : `${base}#${n}`;

    result.transactions.push({
      sourceRef: `${refPrefix}:${opts.sheetName}!R${rowNo}`,
      sourceRow: rowNo,
      sourceHash,
      sourceRaw: raw,
      txnDate,
      dateInferred,
      type,
      amountCents: Math.abs(cents),
      description,
      paymentMethod: method,
      paymentMethodDetail: detail,
      paidBy,
      paidTo,
      notes,
      category,
      categoryInferred: category !== null,
      warnings,
    });
  }
  return result;
}

export interface Reconciliation {
  totalInCents: number;
  totalOutCents: number;
  balanceCents: number;
  count: number;
  expected: { totalInCents?: number | null; totalOutCents?: number | null; balanceCents?: number | null };
  checks: { name: string; expectedCents: number; actualCents: number; ok: boolean }[];
  ok: boolean;
}

export function reconcile(
  txns: Pick<ParsedTransaction, "type" | "amountCents">[],
  expected: Reconciliation["expected"],
): Reconciliation {
  let totalIn = 0;
  let totalOut = 0;
  for (const t of txns) {
    if (t.type === "in") totalIn += t.amountCents;
    else totalOut += t.amountCents;
  }
  const balance = totalIn - totalOut;
  const checks: Reconciliation["checks"] = [];
  const add = (name: string, exp: number | null | undefined, act: number) => {
    if (exp !== null && exp !== undefined) checks.push({ name, expectedCents: exp, actualCents: act, ok: exp === act });
  };
  add("Total received", expected.totalInCents, totalIn);
  add("Total spent", expected.totalOutCents, totalOut);
  add("Remaining balance", expected.balanceCents, balance);
  return {
    totalInCents: totalIn,
    totalOutCents: totalOut,
    balanceCents: balance,
    count: txns.length,
    expected,
    checks,
    ok: checks.length > 0 && checks.every((c) => c.ok),
  };
}

/** Parse the "Summary" tab: rows like  Total funds received,"PKR 296,500". */
export function parseSummarySheet(rows: string[][]): Reconciliation["expected"] {
  const out: Reconciliation["expected"] = {};
  for (const r of rows) {
    const label = clean(r[0]).toLowerCase();
    const v = parseAmountToCents(clean(r[1]));
    if (v === null) continue;
    if (label.includes("received")) out.totalInCents = v;
    else if (label.includes("expense") || label.includes("spent") || label.includes("paid")) out.totalOutCents = v;
    else if (label.includes("balance") || label.includes("remaining")) out.balanceCents = v;
  }
  return out;
}
