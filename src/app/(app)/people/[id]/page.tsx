import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, PageHeader, StatTile } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { getPeople, reportByPerson } from "@/lib/queries";
import { PERSON_KINDS } from "@/lib/types";
import { setPersonActive, updatePerson } from "../actions";
import { PersonForm } from "../person-form";

export const metadata: Metadata = { title: "Person" };

export default async function PersonPage({ params }: PageProps<"/people/[id]">) {
  const { id } = await params;
  const [people, totals, user] = await Promise.all([getPeople(true), reportByPerson(null, null), getCurrentUser()]);
  const person = people.find((p) => p.id === id);
  if (!person || !user) notFound();
  const t = totals.find((x) => x.personId === id);
  const isAdmin = user.role === "admin";

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={person.name}
        description={
          <span className="flex items-center gap-2">
            {PERSON_KINDS.find((k) => k.value === person.kind)?.label ?? "Type not specified"}
            {!person.is_active && <Badge tone="amber">Inactive</Badge>}
          </span>
        }
        back={{ href: "/people", label: "People" }}
        actions={<Link href={`/transactions?person=${person.id}`} className="btn-secondary">View transactions</Link>}
      />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Provided (money in)" value={formatMoney(t?.paidInCents ?? 0)} tone="in" />
        <StatTile label="Paid out" value={formatMoney(t?.paidOutCents ?? 0)} tone="out" />
        <StatTile label="Received (money in)" value={formatMoney(t?.receivedInCents ?? 0)} />
        <StatTile label="Paid to them" value={formatMoney(t?.receivedOutCents ?? 0)} />
      </div>
      {(person.phone || person.notes) && (
        <Card className="mt-4" title="Contact & notes">
          {person.phone && <p className="text-sm">📞 <a href={`tel:${person.phone}`} className="text-brand">{person.phone}</a></p>}
          {person.notes && <p className="mt-1 text-sm text-slate-700">{person.notes}</p>}
        </Card>
      )}
      {isAdmin && (
        <Card className="mt-4" title="Edit person">
          <PersonForm action={updatePerson.bind(null, person.id)} person={person} submitLabel="Save changes" />
          <form action={setPersonActive.bind(null, person.id, !person.is_active)} className="mt-4 border-t border-border pt-4">
            <p className="mb-2 text-sm text-muted">
              {person.is_active
                ? "Deactivating hides this person from the pickers when adding transactions. Existing transactions are not changed."
                : "This person is hidden from the pickers. Reactivate to use them again."}
            </p>
            <button className={person.is_active ? "btn-secondary text-amber-700" : "btn-secondary"}>{person.is_active ? "Deactivate" : "Reactivate"}</button>
          </form>
        </Card>
      )}
    </div>
  );
}
