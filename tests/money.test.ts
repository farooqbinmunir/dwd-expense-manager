import { describe, expect, it } from "vitest";
import {
  centsToDecimal,
  dbToCents,
  formatMoney,
  parseAmountToCents,
  parsePositiveAmount,
  signedCents,
  sumCents,
} from "@/lib/money";

describe("parseAmountToCents", () => {
  it.each([
    ["25000", 2_500_000],
    ["-3500", -350_000],
    [" 1,234.5 ", 123_450],
    ["PKR 296,500", 29_650_000],
    ["Rs. 12.05", 1_205],
    ["- 70", -7_000],
    ["0.1", 10],
    ["0.29", 29],
    ["1234.50", 123_450],
  ])("%s → %d", (input, cents) => {
    expect(parseAmountToCents(input)).toBe(cents);
  });

  it.each(["", "abc", "1.234", "12,34", "1e5", "--5", "5-", "1,2345", "12.3.4", "99999999999999"])(
    "rejects %j",
    (input) => {
      expect(parseAmountToCents(input)).toBeNull();
    },
  );

  it("positive-only helper rejects zero and negatives", () => {
    expect(parsePositiveAmount("0")).toBeNull();
    expect(parsePositiveAmount("-5")).toBeNull();
    expect(parsePositiveAmount("5")).toBe(500);
  });
});

describe("decimal conversions", () => {
  it("round-trips without floating point error", () => {
    // 0.1 + 0.2 style problems must not occur
    const total = sumCents([parseAmountToCents("0.1")!, parseAmountToCents("0.2")!]);
    expect(centsToDecimal(total)).toBe("0.30");
    expect(centsToDecimal(-5)).toBe("-0.05");
    expect(centsToDecimal(29_650_000)).toBe("296500.00");
    expect(dbToCents("296500.00")).toBe(29_650_000);
    expect(dbToCents(null)).toBe(0);
    expect(() => dbToCents("12abc")).toThrow();
  });

  it("sums many small values exactly", () => {
    const values = Array.from({ length: 1000 }, () => parseAmountToCents("0.01")!);
    expect(sumCents(values)).toBe(1000);
  });
});

describe("balance effect", () => {
  it("money in is positive, money out negative", () => {
    expect(signedCents("in", 500)).toBe(500);
    expect(signedCents("out", 500)).toBe(-500);
  });

  it("matches the sheet totals for a small ledger", () => {
    const ledger: ["in" | "out", string][] = [
      ["in", "25000"],
      ["out", "3500"],
      ["out", "19250"],
      ["out", "330"],
      ["out", "320"],
    ];
    const balance = sumCents(ledger.map(([t, a]) => signedCents(t, parseAmountToCents(a)!)));
    expect(formatMoney(balance)).toBe("PKR 1,600");
  });
});

describe("formatMoney", () => {
  it("formats with grouping, decimals and sign", () => {
    expect(formatMoney(29_650_000)).toBe("PKR 296,500");
    expect(formatMoney(-123_450)).toBe("-PKR 1,234.50");
    expect(formatMoney(500, { sign: "always" })).toBe("+PKR 5");
    expect(formatMoney(-500, { currency: false })).toBe("-5");
    expect(formatMoney(0)).toBe("PKR 0");
  });
});
