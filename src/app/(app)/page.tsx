import Link from "next/link";
import { CategoryBars, InOutChart } from "@/components/charts";
import { Alert, Amount, Card, EmptyState, PageHeader, StatTile } from "@/components/ui";
import { formatDate, formatMonth } from "@/lib/dates";
import { dbToCents, formatMoney } from "@/lib/money";
import { listTransactions, reportByCategory, reportByPeriod, reportTotals } from "@/lib/queries";

export default async function DashboardPage({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const [totals, categories, monthly, weekly, recent] = await Promise.all([
    reportTotals(null, null),
    reportByCategory(null, null, "out"),
    reportByPeriod(null, null, "month"),
    reportByPeriod(null, null, "week"),
    listTransactions({ page: 1 }),
  ]);

  // Weekly resolution while the project is young; monthly once there is more history.
  const useWeekly = monthly.length <= 3;
  const chartData = (useWeekly ? weekly.slice(-12) : monthly.slice(-12)).map((p) => ({
    label: useWeekly ? formatDate(p.period).replace(/ \d{4}$/, "") : formatMonth(p.period),
    sublabel: useWeekly ? `Week of ${formatDate(p.period)}` : formatMonth(p.period),
    inCents: p.inCents,
    outCents: p.outCents,
  }));

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="DWD office construction — live figures from the ledger"
        actions={<Link href="/transactions/new" className="btn-primary hidden sm:inline-flex">+ Add transaction</Link>}
      />
      {sp.error === "admin-only" && <div className="mb-4"><Alert>That page is only available to admins.</Alert></div>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Money received" value={formatMoney(totals.inCents)} sub={`${totals.inCount} entries`} tone="in" />
        <StatTile label="Money spent" value={formatMoney(totals.outCents)} sub={`${totals.outCount} entries`} tone="out" />
        <StatTile label="Remaining balance" value={formatMoney(totals.balanceCents)} sub={totals.balanceCents < 0 ? "Overspent" : "Received − spent"} tone="brand" />
        <StatTile label="Transactions" value={String(totals.count)} sub="All time" />
      </div>

      {totals.count === 0 ? (
        <div className="mt-6">
          <EmptyState title="No transactions yet" action={<Link href="/transactions/new" className="btn-primary">Add a transaction</Link>}>
            Import the historical spreadsheet (see README) or start recording payments.
          </EmptyState>
        </div>
      ) : (
        <>
          <div className="mt-4 grid gap-4 lg:grid-cols-5">
            <Card className="lg:col-span-3" title={`Income vs expense (${useWeekly ? "weekly" : "monthly"})`}>
              <InOutChart data={chartData} />
            </Card>
            <Card className="lg:col-span-2" title="Expenses by category" actions={<Link href="/reports" className="text-xs font-medium text-brand">Reports →</Link>}>
              <CategoryBars
                data={categories.slice(0, 8).map((c) => ({ key: c.categoryId ?? "none", name: c.name, cents: c.cents, count: c.count }))}
                total={totals.outCents}
                hrefFor={(k) => `/transactions?type=out&category=${k}`}
              />
              {categories.length > 8 && <p className="mt-3 text-xs text-muted">+ {categories.length - 8} more categories in Reports</p>}
            </Card>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-5">
            <Card className="lg:col-span-3" title="Recent transactions" actions={<Link href="/transactions" className="text-xs font-medium text-brand">View all →</Link>}>
              <ul className="-my-2 divide-y divide-border">
                {recent.rows.slice(0, 8).map((t) => (
                  <li key={t.id}>
                    <Link href={`/transactions/${t.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:bg-slate-50">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{t.description ?? <span className="italic text-muted">No description</span>}</p>
                        <p className="truncate text-xs text-muted">{formatDate(t.txn_date)}{t.paid_to_name ? ` · ${t.paid_to_name}` : ""}</p>
                      </div>
                      <Amount type={t.type} cents={dbToCents(t.amount)} className="text-sm" />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
            <Card className="lg:col-span-2" title="Monthly overview">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted">
                  <tr>
                    <th className="pb-2 font-medium">Month</th>
                    <th className="pb-2 text-right font-medium">In</th>
                    <th className="pb-2 text-right font-medium">Out</th>
                    <th className="pb-2 text-right font-medium">Net</th>
                  </tr>
                </thead>
                <tbody className="tabular divide-y divide-border">
                  {[...monthly].reverse().map((m) => (
                    <tr key={m.period}>
                      <td className="py-2">
                        <Link href={`/reports?period=month&date=${m.period}`} className="text-brand hover:underline">{formatMonth(m.period)}</Link>
                      </td>
                      <td className="py-2 text-right text-in-text">{formatMoney(m.inCents, { currency: false })}</td>
                      <td className="py-2 text-right text-out-text">{formatMoney(m.outCents, { currency: false })}</td>
                      <td className="py-2 text-right font-medium">{formatMoney(m.inCents - m.outCents, { currency: false })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>
        </>
      )}
    </>
  );
}
