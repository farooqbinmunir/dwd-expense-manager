import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Alert, PageHeader } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { dbToCents, centsToDecimal } from "@/lib/money";
import { getCategories, getPeople, getTransaction } from "@/lib/queries";
import { txnCode } from "@/lib/types";
import { updateTransaction } from "../../actions";
import { TransactionForm } from "../../transaction-form";

export const metadata: Metadata = { title: "Edit transaction" };

export default async function EditTransactionPage({ params }: PageProps<"/transactions/[id]/edit">) {
  const { id } = await params;
  const [t, user, people, categories] = await Promise.all([getTransaction(id), getCurrentUser(), getPeople(true), getCategories(true)]);
  if (!t || !user) notFound();
  const canEdit = user.role === "admin" || t.created_by === user.id;
  const back = { href: `/transactions/${t.id}`, label: txnCode(t.txn_no) };

  if (!canEdit) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Edit transaction" back={back} />
        <Alert>Only an admin or the person who recorded this entry can edit it.</Alert>
      </div>
    );
  }

  // Show active people/categories plus whatever is currently selected (even if deactivated).
  const pickPeople = people.filter((p) => p.is_active || p.id === t.paid_by_id || p.id === t.paid_to_id);
  const pickCategories = categories.filter((c) => c.is_active || c.id === t.category_id);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={`Edit ${txnCode(t.txn_no)}`} back={back} />
      <div className="card p-4 sm:p-6">
        <TransactionForm
          mode="edit"
          action={updateTransaction.bind(null, t.id)}
          people={pickPeople}
          categories={pickCategories}
          cancelHref={`/transactions/${t.id}`}
          defaults={{
            txn_date: t.txn_date,
            type: t.type,
            // Show "1234" or "1234.50" – never a float
            amount: centsToDecimal(dbToCents(t.amount)).replace(/\.00$/, ""),
            description: t.description ?? "",
            category_id: t.category_id ?? "",
            payment_method: t.payment_method ?? "",
            payment_method_detail: t.payment_method_detail ?? "",
            paid_by_id: t.paid_by_id ?? "",
            paid_to_id: t.paid_to_id ?? "",
            notes: t.notes ?? "",
          }}
        />
      </div>
    </div>
  );
}
