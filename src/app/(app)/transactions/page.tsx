import type { Metadata } from "next";
import Link from "next/link";
import { Alert, Amount, Badge, EmptyState, PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/dates";
import { dbToCents, formatMoney } from "@/lib/money";
import { getCategories, getPeople, listAllTransactions, listTransactions, PAGE_SIZE, parseFilters, totalsOf, type TxnFilters } from "@/lib/queries";
import { PAYMENT_METHODS, paymentMethodLabel, txnCode } from "@/lib/types";

export const metadata: Metadata = { title: "Transactions" };

function qs(f: TxnFilters, overrides: Partial<Record<keyof TxnFilters, string | number | undefined>> = {}) {
  const p = new URLSearchParams();
  const merged = { ...f, ...overrides } as Record<string, string | number | undefined>;
  for (const [k, v] of Object.entries(merged)) if (v !== undefined && v !== "" && !(k === "page" && v === 1)) p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
}

export default async function TransactionsPage({ searchParams }: PageProps<"/transactions">) {
  const sp = await searchParams;
  const f = parseFilters(sp);
  const filtered = Boolean(f.q || f.from || f.to || f.type || f.category || f.method || f.person);
  const [{ rows, total, page }, people, categories, all] = await Promise.all([
    listTransactions(f),
    getPeople(true),
    getCategories(true),
    filtered ? listAllTransactions(f) : Promise.resolve(null),
  ]);
  const totals = all ? totalsOf(all) : null;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <PageHeader
        title="Transactions"
        description={`${total} ${filtered ? "matching" : "recorded"} transaction${total === 1 ? "" : "s"}`}
        actions={
          <>
            <a href={`/api/export${qs({ ...f, page: undefined, sort: undefined })}`} className="btn-secondary">Export CSV</a>
            <Link href="/transactions/new" className="btn-primary hidden sm:inline-flex">+ Add transaction</Link>
          </>
        }
      />
      {sp.deleted === "1" && <div className="mb-4"><Alert tone="success">Transaction deleted.</Alert></div>}

      <form method="get" className="card mb-4 p-3 sm:p-4">
        <div className="flex gap-2">
          <input name="q" defaultValue={f.q} placeholder="Search description, person, amount, TXN no…" className="input" aria-label="Search" />
          <button className="btn-primary shrink-0">Search</button>
        </div>
        <details className="mt-3" open={Boolean(f.from || f.to || f.type || f.category || f.method || f.person || f.sort)}>
          <summary className="cursor-pointer text-sm font-medium text-brand">Filters &amp; sorting</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="label" htmlFor="from">From</label>
              <input id="from" type="date" name="from" defaultValue={f.from} className="input" />
            </div>
            <div>
              <label className="label" htmlFor="to">To</label>
              <input id="to" type="date" name="to" defaultValue={f.to} className="input" />
            </div>
            <div>
              <label className="label" htmlFor="type">Type</label>
              <select id="type" name="type" defaultValue={f.type ?? ""} className="input">
                <option value="">All</option>
                <option value="in">Money In</option>
                <option value="out">Money Out</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="category">Category</label>
              <select id="category" name="category" defaultValue={f.category ?? ""} className="input">
                <option value="">All</option>
                <option value="none">Uncategorised</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="method">Payment method</label>
              <select id="method" name="method" defaultValue={f.method ?? ""} className="input">
                <option value="">All</option>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
                <option value="none">Not recorded</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="person">Person (paid by or to)</label>
              <select id="person" name="person" defaultValue={f.person ?? ""} className="input">
                <option value="">Anyone</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="sort">Sort by</label>
              <select id="sort" name="sort" defaultValue={f.sort ?? "date_desc"} className="input">
                <option value="date_desc">Date (newest first)</option>
                <option value="date_asc">Date (oldest first)</option>
                <option value="amount_desc">Amount (highest first)</option>
                <option value="amount_asc">Amount (lowest first)</option>
              </select>
            </div>
            <div className="flex items-end gap-2">
              <button className="btn-primary flex-1">Apply</button>
              <Link href="/transactions" className="btn-secondary">Reset</Link>
            </div>
          </div>
        </details>
      </form>

      {totals && (
        <div className="mb-4 grid grid-cols-3 gap-2 text-center text-sm">
          <div className="card px-2 py-2.5"><p className="text-xs text-muted">In</p><p className="tabular font-semibold text-in-text">{formatMoney(totals.inCents)}</p></div>
          <div className="card px-2 py-2.5"><p className="text-xs text-muted">Out</p><p className="tabular font-semibold text-out-text">{formatMoney(totals.outCents)}</p></div>
          <div className="card px-2 py-2.5"><p className="text-xs text-muted">Net</p><p className="tabular font-semibold">{formatMoney(totals.netCents)}</p></div>
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState
          title={filtered ? "No transactions match these filters" : "No transactions yet"}
          action={filtered ? <Link href="/transactions" className="btn-secondary">Clear filters</Link> : <Link href="/transactions/new" className="btn-primary">Add the first transaction</Link>}
        >
          {filtered ? "Try a wider date range or a different search." : "Record money received or spent and it will appear here."}
        </EmptyState>
      ) : (
        <>
          {/* Mobile list */}
          <ul className="card divide-y divide-border md:hidden">
            {rows.map((t) => (
              <li key={t.id}>
                <Link href={`/transactions/${t.id}`} className="flex items-start justify-between gap-3 px-4 py-3 active:bg-slate-50">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{t.description ?? <span className="italic text-muted">No description</span>}</p>
                    <p className="mt-0.5 truncate text-xs text-muted">
                      {formatDate(t.txn_date)} · {t.category_name ?? "Uncategorised"}
                      {t.paid_to_name ? ` · ${t.paid_to_name}` : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <Amount type={t.type} cents={dbToCents(t.amount)} className="text-sm" />
                    {t.attachment_count > 0 && <p className="text-xs text-muted">📎 {t.attachment_count}</p>}
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          {/* Desktop table */}
          <div className="card hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-slate-50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Description</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Method</th>
                  <th className="px-4 py-3 font-medium">Paid by → to</th>
                  <th className="px-4 py-3 text-right font-medium">Amount</th>
                  <th className="px-4 py-3 text-right font-medium" title="Balance after this transaction (all transactions, in date order)">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 whitespace-nowrap text-slate-600">{formatDate(t.txn_date)}</td>
                    <td className="max-w-xs px-4 py-3">
                      <Link href={`/transactions/${t.id}`} className="font-medium text-slate-900 hover:text-brand">
                        {t.description ?? <span className="italic text-muted">No description</span>}
                      </Link>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-muted">
                        <span>{txnCode(t.txn_no)}</span>
                        {t.attachment_count > 0 && <span title="Receipts">📎 {t.attachment_count}</span>}
                        {t.source !== "app" && <span>· from sheet</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {t.category_name ? (
                        <span className="text-slate-700">{t.category_name}{t.category_inferred && <span className="ml-1 text-xs text-muted" title="Auto-assigned during import">(auto)</span>}</span>
                      ) : (
                        <Badge>Uncategorised</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{paymentMethodLabel(t.payment_method)}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {t.paid_by_name ?? "—"} <span className="text-muted">→</span> {t.paid_to_name ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right"><Amount type={t.type} cents={dbToCents(t.amount)} /></td>
                    <td className="tabular px-4 py-3 text-right text-slate-600">{formatMoney(dbToCents(t.running_balance), { currency: false })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pages > 1 && (
            <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Pagination">
              {page > 1 ? <Link href={`/transactions${qs(f, { page: page - 1 })}`} className="btn-secondary">← Previous</Link> : <span />}
              <span className="text-muted">Page {page} of {pages}</span>
              {page < pages ? <Link href={`/transactions${qs(f, { page: page + 1 })}`} className="btn-secondary">Next →</Link> : <span />}
            </nav>
          )}
        </>
      )}
    </>
  );
}
