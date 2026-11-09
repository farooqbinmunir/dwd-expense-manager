import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { csvCell, parseCsv, toCsv } from "@/lib/csv";
import {
  expandMerges,
  normalisePaymentMethod,
  parseLedger,
  parseSheetDate,
  parseSummarySheet,
  reconcile,
} from "@/lib/import/ledger";
import { suggestCategory } from "@/lib/import/categorize";
import { colLetter, parseCellRef } from "@/lib/import/xlsx-images";

const SHEET = `DWD - Office Construction Expenses,,,,,,
Date,In/Out,Purpose,Payment method,Paid by,Paid to,
10/10/2026,25000,Ceiling,Online,Naveed,Farooq,
,-3500,Advance for Ceiling,Online,Farooq,Uniq Interior,
10/23/2026,50000,For floor chips material,20k cash + 30k bank,Naveed,Farooq,
,25000,,Online,Naveed,Farooq,
10/22/2026,-2400,"Glue, white cement",Online,Farooq,White cement vendor,
,-6520,,,Farooq,,
,abc,Broken amount,Cash,Farooq,Shop,
,,,,,,
Remaining Total,85580,,,,,
`;

describe("csv", () => {
  it("parses quotes, commas, newlines and BOM", () => {
    const rows = parseCsv('﻿a,"b,c","d ""e"""\r\n1,"x\ny",3\n');
    expect(rows).toEqual([
      ["a", "b,c", 'd "e"'],
      ["1", "x\ny", "3"],
    ]);
  });
  it("throws on an unterminated quote", () => {
    expect(() => parseCsv('a,"b')).toThrow();
  });
  it("escapes formula injection but keeps negative numbers", () => {
    expect(csvCell("=HYPERLINK()")).toBe("'=HYPERLINK()");
    expect(csvCell("-3500")).toBe("-3500");
    expect(csvCell("-cmd")).toBe("'-cmd");
    expect(toCsv([["a,b", 1]])).toBe('﻿"a,b",1\r\n');
  });
});

describe("dates and payment methods", () => {
  it("parses M/D/YYYY and ISO, rejects impossible dates", () => {
    expect(parseSheetDate("11/1/2026")).toBe("2026-11-01");
    expect(parseSheetDate("2026-10-31")).toBe("2026-10-31");
    expect(parseSheetDate("2/30/2026")).toBeNull();
    expect(parseSheetDate("13/1/2026")).toBeNull();
    expect(parseSheetDate("yesterday")).toBeNull();
  });
  it("normalises methods and keeps detail for mixed ones", () => {
    expect(normalisePaymentMethod("Online ")).toEqual({ method: "online", detail: null });
    expect(normalisePaymentMethod("Cash")).toEqual({ method: "cash", detail: null });
    expect(normalisePaymentMethod("20k cash + 30k bank")).toEqual({ method: "mixed", detail: "20k cash + 30k bank" });
    expect(normalisePaymentMethod("cheque")).toEqual({ method: "other", detail: "cheque" });
    expect(normalisePaymentMethod("")).toEqual({ method: null, detail: null });
  });
});

describe("parseLedger", () => {
  const rows = parseCsv(SHEET);

  it("parses rows, carries blank dates down and reports problems", () => {
    const r = parseLedger(rows, { sheetName: "INOUT" });
    expect(r.transactions).toHaveLength(6);
    expect(r.errors).toEqual([expect.objectContaining({ row: 9, reason: 'Unreadable amount "abc"' })]);
    expect(r.footerBalanceCents).toBe(8_558_000);
    expect(r.skipped.map((s) => s.reason)).toEqual(["Title row", "Column header row", "Blank row", 'Summary/footer row ("Remaining Total")']);

    const [first, second] = r.transactions;
    expect(first).toMatchObject({ sourceRef: "gsheet:INOUT!R3", type: "in", amountCents: 2_500_000, txnDate: "2026-10-10", dateInferred: false });
    expect(second).toMatchObject({ type: "out", amountCents: 350_000, txnDate: "2026-10-10", dateInferred: true, paidTo: "Uniq Interior" });

    const blank = r.transactions.find((t) => t.sourceRow === 8)!;
    expect(blank.description).toBeNull(); // never invented
    expect(blank.category).toBeNull();
    expect(blank.warnings).toContain("No description in sheet");

    const outOfOrder = r.transactions.find((t) => t.sourceRow === 7)!;
    expect(outOfOrder.warnings.join()).toMatch(/earlier than the row above/);
  });

  it("expands merged cells so rows get their real values", () => {
    const r = parseLedger(rows, { sheetName: "INOUT", merges: ["A3:A4", "C5:C6"] });
    const row4 = r.transactions.find((t) => t.sourceRow === 4)!;
    expect(row4.dateInferred).toBe(false);
    expect(row4.sourceRaw.merged_from).toEqual({ date: "A3:A4" });
    const row6 = r.transactions.find((t) => t.sourceRow === 6)!;
    expect(row6.description).toBe("For floor chips material");
    expect(row6.sourceRaw.purpose).toBe(""); // raw keeps the cell exactly as exported
  });

  it("produces stable, unique hashes (idempotency keys)", () => {
    const a = parseLedger(rows, { sheetName: "INOUT" });
    const b = parseLedger(rows, { sheetName: "INOUT" });
    expect(a.transactions.map((t) => t.sourceHash)).toEqual(b.transactions.map((t) => t.sourceHash));
    expect(new Set(a.transactions.map((t) => t.sourceHash)).size).toBe(a.transactions.length);
  });

  it("gives identical rows distinct hashes via an occurrence counter", () => {
    const dup = parseCsv("Date,In/Out\n10/1/2026,-100,Tea,Cash,A,B\n10/1/2026,-100,Tea,Cash,A,B\n");
    const r = parseLedger(dup, { sheetName: "X" });
    expect(r.transactions[1].sourceHash).toBe(`${r.transactions[0].sourceHash}#2`);
  });

  it("errors on a first row without any date", () => {
    const r = parseLedger(parseCsv("Date,In/Out\n,-100,Tea\n"), { sheetName: "X" });
    expect(r.transactions).toHaveLength(0);
    expect(r.errors[0].reason).toMatch(/no earlier date/);
  });

  it("requires the header row", () => {
    expect(() => parseLedger([["foo"]], { sheetName: "X" })).toThrow(/Header row/);
  });
});

describe("expandMerges", () => {
  it("fills every cell of a range from the top-left value", () => {
    const { rows, filled } = expandMerges([["x", ""], ["", ""], ["", ""]], ["A1:B3"]);
    expect(rows).toEqual([["x", "x"], ["x", "x"], ["x", "x"]]);
    expect(filled.get("3:1")).toBe("A1:B3");
  });
  it("cell helpers", () => {
    expect(colLetter(0)).toBe("A");
    expect(colLetter(26)).toBe("AA");
    expect(parseCellRef("G94")).toEqual({ row: 94, col: 6 });
  });
});

describe("reconciliation", () => {
  it("detects matches and mismatches", () => {
    const txns = [
      { type: "in" as const, amountCents: 1000 },
      { type: "out" as const, amountCents: 400 },
    ];
    const ok = reconcile(txns, { totalInCents: 1000, totalOutCents: 400, balanceCents: 600 });
    expect(ok.ok).toBe(true);
    const bad = reconcile(txns, { totalInCents: 1000, totalOutCents: 500 });
    expect(bad.ok).toBe(false);
    expect(bad.checks.find((c) => !c.ok)?.name).toBe("Total spent");
  });
  it("reads the Summary tab", () => {
    const s = parseSummarySheet(
      parseCsv('Detail,Amount\nTotal funds received,"PKR 296,500"\nTotal expenses paid,"PKR 292,500"\nRemaining balance,"PKR 4,000"\n'),
    );
    expect(s).toEqual({ totalInCents: 29_650_000, totalOutCents: 29_250_000, balanceCents: 400_000 });
  });
});

describe("suggestCategory", () => {
  it.each([
    ["out", "Labour lunch (khana + chaye)", "Uniq Interior labour", "Food & Refreshments"],
    ["out", "Advance for Ceiling", "Uniq Interior", "Ceiling"],
    ["out", "Electrician labour", "Shakeel Electrician", "Electrical"],
    ["out", "Colour material(White cement, Distamber etc)", "Talha paint house", "Paint & Colour"],
    ["out", "Cement 2 bori + black colour 2kg", "Hafiz building material store", "Construction Materials"],
    ["out", "Chips 20 bori *180", null, "Floor Chips"],
    ["out", "Labor mistri", "Mistri", "Labour"],
    ["out", "Tea spoon", "Shop", "Furnishing & Fittings"],
    ["out", "Petrol for Pest control", "Petrol pump", "Transport & Fuel"],
    ["out", "Motor payment", "Motor shop", "Plumbing & Sanitary"],
    ["in", "Return 2 bori cement", "Farooq", "Refunds & Returns"],
    ["in", "Shop rent received", "Farooq", "Rent Income"],
    ["in", "Incoming balance for Toolkit, new seat cover, drill rent, other misc", "Farooq", "Funds Received"],
  ] as const)("%s %s → %s", (type, desc, payee, cat) => {
    expect(suggestCategory(type, desc, payee)).toBe(cat);
  });
  it("leaves unknown / blank rows uncategorised", () => {
    expect(suggestCategory("out", null, null)).toBeNull();
    expect(suggestCategory("out", "Something new", "Someone")).toBeNull();
  });
});

// Full-sheet regression test against the snapshot captured by the import script, if present.
const snapDir = join(process.cwd(), "tests", "fixtures");
describe.runIf(existsSync(join(snapDir, "inout.csv")))("real spreadsheet snapshot", () => {
  it("reconciles exactly to the Summary tab and has no problem rows", async () => {
    const { extractMerges } = await import("@/lib/import/xlsx-images");
    const merges = existsSync(join(snapDir, "book.xlsx"))
      ? extractMerges(new Uint8Array(readFileSync(join(snapDir, "book.xlsx"))), "INOUT")
      : [];
    const r = parseLedger(parseCsv(readFileSync(join(snapDir, "inout.csv"), "utf8")), { sheetName: "INOUT", merges });
    const expected = parseSummarySheet(parseCsv(readFileSync(join(snapDir, "summary.csv"), "utf8")));
    const rec = reconcile(r.transactions, expected);
    expect(r.errors).toEqual([]);
    expect(rec.ok).toBe(true);
    expect(r.footerBalanceCents).toBe(rec.balanceCents);
  });
});
