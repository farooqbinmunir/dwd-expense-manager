import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { getPeople, reportByPerson } from "@/lib/queries";
import { PERSON_KINDS } from "@/lib/types";
import { createPerson } from "./actions";
import { PersonForm } from "./person-form";

export const metadata: Metadata = { title: "People" };

export default async function PeoplePage({ searchParams }: PageProps<"/people">) {
  const sp = await searchParams;
  const showInactive = sp.show === "all";
  const [people, totals, user] = await Promise.all([getPeople(true), reportByPerson(null, null), getCurrentUser()]);
  const byId = new Map(totals.map((t) => [t.personId, t]));
  const list = people.filter((p) => showInactive || p.is_active);
  const inactiveCount = people.filter((p) => !p.is_active).length;

  return (
    <>
      <PageHeader title="People" description="Everyone who pays or receives money: team members, vendors, labour." />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {list.length === 0 ? (
            <EmptyState title="No people yet">Add someone using the form.</EmptyState>
          ) : (
            <div className="card overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-slate-50 text-left text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 text-right font-medium" title="Total of transactions where this person is the payer">Paid by them</th>
                    <th className="px-4 py-3 text-right font-medium" title="Total of transactions where this person is the payee">Paid to them</th>
                    <th className="px-4 py-3 text-right font-medium">Entries</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {list.map((p) => {
                    const t = byId.get(p.id);
                    return (
                      <tr key={p.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <Link href={`/people/${p.id}`} className="font-medium text-slate-900 hover:text-brand">{p.name}</Link>
                          <div className="mt-0.5 flex gap-1.5">
                            {p.kind && <span className="text-xs text-muted">{PERSON_KINDS.find((k) => k.value === p.kind)?.label}</span>}
                            {!p.is_active && <Badge tone="amber">Inactive</Badge>}
                          </div>
                        </td>
                        <td className="tabular px-4 py-3 text-right">{t ? formatMoney(t.paidInCents + t.paidOutCents, { currency: false }) : "—"}</td>
                        <td className="tabular px-4 py-3 text-right">{t ? formatMoney(t.receivedInCents + t.receivedOutCents, { currency: false }) : "—"}</td>
                        <td className="tabular px-4 py-3 text-right text-muted">{t?.count ?? 0}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {inactiveCount > 0 && (
            <p className="mt-3 text-sm">
              <Link href={showInactive ? "/people" : "/people?show=all"} className="font-medium text-brand">
                {showInactive ? "Hide inactive people" : `Show ${inactiveCount} inactive`}
              </Link>
            </p>
          )}
        </div>
        <Card title="Add person">
          <PersonForm action={createPerson} submitLabel="Add person" />
          {user?.role !== "admin" && <p className="mt-3 text-xs text-muted">Only admins can edit or deactivate people.</p>}
        </Card>
      </div>
    </>
  );
}
