import { describe, expect, it } from "vitest";
import { transactionSchema, validateReceiptFile } from "@/lib/validation";
import { addDays, endOfMonth, isISODate, resolvePeriod, shiftAnchor, startOfWeek, todayISO } from "@/lib/dates";

const base = {
  txn_date: "2026-11-09",
  type: "out",
  amount: "1,650",
  description: "  Cement 1 bori ",
  category_id: "",
  payment_method: "online",
  payment_method_detail: "",
  paid_by_id: "",
  paid_to_id: "",
  new_paid_by: "",
  new_paid_to: "",
  notes: "",
};

describe("transaction form validation", () => {
  it("normalises a valid entry; amount becomes an exact decimal string", () => {
    const r = transactionSchema.parse(base);
    expect(r).toMatchObject({ amount: "1650.00", description: "Cement 1 bori", category_id: null, paid_by_id: null, notes: null, payment_method: "online" });
  });

  it.each([
    [{ amount: "0" }, "amount"],
    [{ amount: "-10" }, "amount"],
    [{ amount: "12.345" }, "amount"],
    [{ amount: "abc" }, "amount"],
    [{ txn_date: "2026-02-30" }, "txn_date"],
    [{ type: "both" }, "type"],
    [{ description: "   " }, "description"],
    [{ category_id: "not-a-uuid" }, "category_id"],
    [{ payment_method: "bitcoin" }, "payment_method"],
  ])("rejects %j", (override, field) => {
    const r = transactionSchema.safeParse({ ...base, ...override });
    expect(r.success).toBe(false);
    expect(r.error!.issues.map((i) => i.path[0])).toContain(field);
  });

  it("treats the 'add new person' option as no selection", () => {
    const r = transactionSchema.parse({ ...base, paid_to_id: "__new__", new_paid_to: "Hafiz store" });
    expect(r.paid_to_id).toBeNull();
    expect(r.new_paid_to).toBe("Hafiz store");
  });

  it("validates receipt files", () => {
    expect(validateReceiptFile(new File(["x"], "a.jpg", { type: "image/jpeg" }))).toBeNull();
    expect(validateReceiptFile(new File(["x"], "a.pdf", { type: "application/pdf" }))).toBeNull();
    expect(validateReceiptFile(new File(["x"], "a.exe", { type: "application/x-msdownload" }))).toMatch(/only images/);
    expect(validateReceiptFile(new File([], "e.png", { type: "image/png" }))).toMatch(/empty/);
  });
});

describe("dates & report periods", () => {
  it("computes today in Pakistan time regardless of server timezone", () => {
    // 2026-11-09 20:30 UTC is already 10 Nov in Karachi (UTC+5)
    expect(todayISO(new Date("2026-11-09T20:30:00Z"), "Asia/Karachi")).toBe("2026-11-10");
    expect(todayISO(new Date("2026-11-09T18:59:00Z"), "Asia/Karachi")).toBe("2026-11-09");
  });

  it("date helpers", () => {
    expect(isISODate("2026-11-31")).toBe(false);
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(startOfWeek("2026-11-08")).toBe("2026-11-02"); // Sunday → Monday
    expect(endOfMonth("2026-02-10")).toBe("2026-02-28");
    expect(shiftAnchor("month", "2026-01-31", -1)).toBe("2025-12-01");
  });

  it("resolves daily, weekly, monthly and custom periods", () => {
    const today = "2026-11-10";
    expect(resolvePeriod({ period: "day" }, today)).toMatchObject({ from: today, to: today });
    expect(resolvePeriod({ period: "week", date: "2026-11-10" }, today)).toMatchObject({ from: "2026-11-09", to: "2026-11-15" });
    expect(resolvePeriod({ period: "month", date: "2026-10-15" }, today)).toMatchObject({ from: "2026-10-01", to: "2026-10-31" });
    expect(resolvePeriod({ period: "custom", from: "2026-11-05", to: "2026-10-01" }, today)).toMatchObject({ from: "2026-10-01", to: "2026-11-05" });
    expect(resolvePeriod({ period: "custom", from: "garbage" }, today)).toMatchObject({ from: null, to: null });
    expect(resolvePeriod({}, today)).toMatchObject({ kind: "all", from: null, to: null });
  });
});
