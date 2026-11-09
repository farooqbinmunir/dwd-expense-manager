import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { todayISO } from "@/lib/dates";
import { getCategories, getPeople } from "@/lib/queries";
import { createTransaction } from "../actions";
import { TransactionForm } from "../transaction-form";

export const metadata: Metadata = { title: "Add transaction" };

export default async function NewTransactionPage({ searchParams }: PageProps<"/transactions/new">) {
  const sp = await searchParams;
  const [people, categories] = await Promise.all([getPeople(), getCategories()]);
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Add transaction" back={{ href: "/transactions", label: "Transactions" }} />
      <div className="card p-4 sm:p-6">
        <TransactionForm
          mode="create"
          action={createTransaction}
          people={people}
          categories={categories}
          cancelHref="/transactions"
          defaults={{
            txn_date: todayISO(),
            type: sp.type === "in" ? "in" : "out",
            amount: "",
            description: "",
            category_id: "",
            payment_method: "",
            payment_method_detail: "",
            paid_by_id: "",
            paid_to_id: "",
            notes: "",
          }}
        />
      </div>
    </div>
  );
}
