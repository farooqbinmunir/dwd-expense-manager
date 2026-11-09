import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { centsToDecimal, dbToCents } from "@/lib/money";
import { listAllTransactions, parseFilters, reportByCategory, reportByPerson, reportTotals } from "@/lib/queries";
import { paymentMethodLabel, txnCode } from "@/lib/types";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!user.isActive) return NextResponse.json({ error: "Account not active" }, { status: 403 });

  const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
  const f = parseFilters(sp);
  const range = `${f.from ?? "start"}_to_${f.to ?? "today"}`;
  let rows: unknown[][];
  let name: string;

  if (sp.kind === "summary") {
    const [totals, outCats, inCats, persons] = await Promise.all([
      reportTotals(f.from ?? null, f.to ?? null),
      reportByCategory(f.from ?? null, f.to ?? null, "out"),
      reportByCategory(f.from ?? null, f.to ?? null, "in"),
      reportByPerson(f.from ?? null, f.to ?? null),
    ]);
    const d = centsToDecimal;
    rows = [
      ["DWD Expense Report", `${f.from ?? "start"} to ${f.to ?? "latest"}`],
      [],
      ["Section", "Item", "Entries", "Amount (PKR)"],
      ["Totals", "Money in", totals.inCount, d(totals.inCents)],
      ["Totals", "Money out", totals.outCount, d(totals.outCents)],
      ["Totals", "Net / balance", totals.count, d(totals.balanceCents)],
      ...inCats.map((c) => ["Money in by category", c.name, c.count, d(c.cents)]),
      ...outCats.map((c) => ["Money out by category", c.name, c.count, d(c.cents)]),
      [],
      ["Person", "Provided (in, as payer)", "Paid out (as payer)", "Received (in, as payee)", "Paid to them (out, as payee)", "Entries"],
      ...persons.map((p) => [p.name, d(p.paidInCents), d(p.paidOutCents), d(p.receivedInCents), d(p.receivedOutCents), p.count]),
    ];
    name = `dwd-summary_${range}.csv`;
  } else {
    const txns = await listAllTransactions(f);
    rows = [
      ["Transaction ID", "Date", "Type", "Amount (PKR)", "Signed amount", "Running balance", "Description", "Category", "Category auto-assigned", "Payment method", "Payment detail", "Paid by", "Paid to", "Notes", "Receipts", "Created by", "Created at", "Source", "Sheet row"],
      ...txns.map((t) => [
        txnCode(t.txn_no),
        t.txn_date,
        t.type === "in" ? "Money In" : "Money Out",
        centsToDecimal(dbToCents(t.amount)),
        centsToDecimal(dbToCents(t.signed_amount)),
        centsToDecimal(dbToCents(t.running_balance)),
        t.description ?? "",
        t.category_name ?? "",
        t.category_inferred ? "yes" : "",
        t.payment_method ? paymentMethodLabel(t.payment_method) : "",
        t.payment_method_detail ?? "",
        t.paid_by_name ?? "",
        t.paid_to_name ?? "",
        t.notes ?? "",
        t.attachment_count,
        t.source === "app" ? t.created_by_name || t.created_by_email || "" : "Spreadsheet import",
        t.created_at,
        t.source,
        t.source_row ?? "",
      ]),
    ];
    name = `dwd-transactions_${range}.csv`;
  }

  return new NextResponse(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
