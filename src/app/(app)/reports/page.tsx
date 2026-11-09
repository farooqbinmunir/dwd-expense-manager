import type { Metadata } from "next";
import Link from "next/link";
import { CategoryBars, InOutChart } from "@/components/charts";
import { Amount, Card, EmptyState, PageHeader, StatTile } from "@/components/ui";
import { formatDate, formatMonth, resolvePeriod, shiftAnchor, todayISO, type PeriodKind } from "@/lib/dates";
import { dbToCents, formatMoney } from "@/lib/money";
import { listAllTransactions, reportByCategory, reportByPeriod, reportByPerson, reportTotals } from "@/lib/queries";

export const metadata: Metadata = { title: "Reports" };

const TABS: { kind: PeriodKind; label: string }[] = [
  { kind: "day", label: "Daily" },
  { kind: "week", label: "Weekly" },
  { kind: "month", label: "Monthly" },
  { kind: "custom", label: "Custom" },
  { kind: "all", label: "All time" },
];

function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  const sp = await searchParams;
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const today = todayISO();
  const period = resolvePeriod({ period: s("period") ?? "month", date: s("date"), from: s("from"), to: s("to") }, today);
  const { from, to } = period;
  const anchor = from ?? today;

  // Breakdown resolution
  const span = from && to ? daysBetween(from, to) : 9999;
  const grain: "day" | "week" | "month" = span <= 31 ? "day" : span <= 120 ? "week" : "month";

  const [totals, outCats, inCats, series, persons, txns] = await Promise.all([
    reportTotals(from, to),
    reportByCategory(from, to, "out"),
    reportByCategory(from, to, "in"),
    reportByPeriod(from, to, grain),
    reportByPerson(from, to),
    listAllTransactions({ from: from ?? undefined, to: to ?? undefined }),
  ]);

  const exportQs = new URLSearchParams();
  if (from) exportQs.set("from", from);
  if (to) exportQs.set("to", to);
  const navLink = (dir: -1 | 1) => `/reports?period=${period.kind}&date=${shiftAnchor(period.kind, anchor, dir)}`;

  return (
    <>
      <PageHeader
        title="Reports"
        description={`${period.label}${from && to && from !== to ? ` · ${formatDate(from)} – ${formatDate(to)}` : ""}`}
        actions={
          <>
            <a href={`/api/export?${exportQs}`} className="btn-secondary">Transactions CSV</a>
            <a href={`/api/export?${exportQs}&kind=summary`} className="btn-secondary">Summary CSV</a>
          </>
        }
      />

      <div className="card mb-4 p-3">
        <div className="flex gap-1 overflow-x-auto" role="tablist">
          {TABS.map((t) => (
            <Link
              key={t.kind}
              href={t.kind === "custom" ? `/reports?period=custom${from ? `&from=${from}` : ""}${to ? `&to=${to}` : ""}` : `/reports?period=${t.kind}`}
              role="tab"
              aria-selected={period.kind === t.kind}
              className={`flex min-h-10 items-center rounded-lg px-3 text-sm font-medium whitespace-nowrap ${
                period.kind === t.kind ? "bg-brand text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </div>
        {(period.kind === "day" || period.kind === "week" || period.kind === "month") && (
          <div className="mt-3 flex items-center justify-between gap-2">
            <Link href={navLink(-1)} className="btn-secondary min-h-10 px-3">← Prev</Link>
            <form method="get" className="flex items-center gap-2">
              <input type="hidden" name="period" value={period.kind} />
              <input type="date" name="date" defaultValue={anchor} className="input min-h-10 w-auto" aria-label="Choose date" />
              <button className="btn-secondary min-h-10 px-3">Go</button>
            </form>
            <Link href={navLink(1)} className="btn-secondary min-h-10 px-3">Next →</Link>
          </div>
        )}
        {period.kind === "custom" && (
          <form method="get" className="mt-3 flex flex-wrap items-end gap-2">
            <input type="hidden" name="period" value="custom" />
            <div>
              <label className="label" htmlFor="r-from">From</label>
              <input id="r-from" type="date" name="from" defaultValue={from ?? ""} className="input" />
            </div>
            <div>
              <label className="label" htmlFor="r-to">To</label>
              <input id="r-to" type="date" name="to" defaultValue={to ?? ""} className="input" />
            </div>
            <button className="btn-primary">Run report</button>
          </form>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Money in" value={formatMoney(totals.inCents)} sub={`${totals.inCount} entries`} tone="in" />
        <StatTile label="Money out" value={formatMoney(totals.outCents)} sub={`${totals.outCount} entries`} tone="out" />
        <StatTile label="Net for period" value={formatMoney(totals.balanceCents)} tone="brand" />
        <StatTile label="Transactions" value={String(totals.count)} />
      </div>

      {totals.count === 0 ? (
        <div className="mt-4"><EmptyState title="No transactions in this period">Pick another period or date range.</EmptyState></div>
      ) : (
        <>
          <div className="mt-4 grid gap-4 lg:grid-cols-5">
            <Card className="lg:col-span-3" title={`Income & expense by ${grain}`}>
              <InOutChart
                data={series.map((p) => ({
                  label: grain === "month" ? formatMonth(p.period) : formatDate(p.period).replace(/ \d{4}$/, ""),
                  sublabel: grain === "week" ? `Week of ${formatDate(p.period)}` : grain === "month" ? formatMonth(p.period) : formatDate(p.period),
                  inCents: p.inCents,
                  outCents: p.outCents,
                }))}
              />
            </Card>
            <Card className="lg:col-span-2" title="Expenses by category">
              <CategoryBars
                data={outCats.map((c) => ({ key: c.categoryId ?? "none", name: c.name, cents: c.cents, count: c.count }))}
                total={totals.outCents}
              />
            </Card>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card title="Income & expense breakdown">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted">
                  <tr><th className="pb-2 font-medium">Category</th><th className="pb-2 text-right font-medium">Entries</th><th className="pb-2 text-right font-medium">Amount</th></tr>
                </thead>
                <tbody className="tabular divide-y divide-border">
                  <tr><td colSpan={3} className="pt-3 pb-1 text-xs font-semibold tracking-wide text-in-text uppercase">Money in</td></tr>
                  {inCats.map((c) => (
                    <tr key={`in-${c.categoryId}`}><td className="py-1.5">{c.name}</td><td className="py-1.5 text-right text-muted">{c.count}</td><td className="py-1.5 text-right">{formatMoney(c.cents)}</td></tr>
                  ))}
                  <tr className="font-semibold"><td className="py-1.5">Total in</td><td /><td className="py-1.5 text-right text-in-text">{formatMoney(totals.inCents)}</td></tr>
                  <tr><td colSpan={3} className="pt-4 pb-1 text-xs font-semibold tracking-wide text-out-text uppercase">Money out</td></tr>
                  {outCats.map((c) => (
                    <tr key={`out-${c.categoryId}`}><td className="py-1.5">{c.name}</td><td className="py-1.5 text-right text-muted">{c.count}</td><td className="py-1.5 text-right">{formatMoney(c.cents)}</td></tr>
                  ))}
                  <tr className="font-semibold"><td className="py-1.5">Total out</td><td /><td className="py-1.5 text-right text-out-text">{formatMoney(totals.outCents)}</td></tr>
                  <tr className="font-semibold"><td className="py-2">Net</td><td /><td className="py-2 text-right">{formatMoney(totals.balanceCents)}</td></tr>
                </tbody>
              </table>
            </Card>

            <Card title="Person-wise payments">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted">
                    <tr>
                      <th className="pb-2 font-medium">Person</th>
                      <th className="pb-2 text-right font-medium" title="Money In where this person is the payer">Provided</th>
                      <th className="pb-2 text-right font-medium" title="Money Out where this person is the payer">Paid out</th>
                      <th className="pb-2 text-right font-medium" title="Money Out paid to this person">Paid to them</th>
                    </tr>
                  </thead>
                  <tbody className="tabular divide-y divide-border">
                    {persons.map((p) => (
                      <tr key={p.personId}>
                        <td className="py-1.5"><Link href={`/people/${p.personId}`} className="text-brand hover:underline">{p.name}</Link></td>
                        <td className="py-1.5 text-right">{p.paidInCents ? formatMoney(p.paidInCents, { currency: false }) : "—"}</td>
                        <td className="py-1.5 text-right">{p.paidOutCents ? formatMoney(p.paidOutCents, { currency: false }) : "—"}</td>
                        <td className="py-1.5 text-right">{p.receivedOutCents ? formatMoney(p.receivedOutCents, { currency: false }) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          <Card className="mt-4" title={`Transactions (${txns.length})`}>
            <div className="-mx-4 -my-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-slate-50 text-left text-xs text-muted">
                  <tr><th className="px-4 py-2 font-medium">Date</th><th className="px-4 py-2 font-medium">Description</th><th className="px-4 py-2 font-medium">Category</th><th className="px-4 py-2 text-right font-medium">Amount</th></tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {txns.map((t) => (
                    <tr key={t.id}>
                      <td className="px-4 py-2 whitespace-nowrap text-slate-600">{formatDate(t.txn_date)}</td>
                      <td className="px-4 py-2"><Link href={`/transactions/${t.id}`} className="hover:text-brand">{t.description ?? <i className="text-muted">No description</i>}</Link></td>
                      <td className="px-4 py-2 text-slate-600">{t.category_name ?? "Uncategorised"}</td>
                      <td className="px-4 py-2 text-right"><Amount type={t.type} cents={dbToCents(t.amount)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </>
  );
}
