import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, PageHeader } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { getCategories, reportByCategory } from "@/lib/queries";
import { saveCategory, setCategoryActive } from "./actions";
import { CategoryForm } from "./category-form";

export const metadata: Metadata = { title: "Categories" };

const APPLIES = { in: "Money In", out: "Money Out", both: "Both" } as const;

export default async function CategoriesPage() {
  const [categories, outTotals, inTotals, user] = await Promise.all([
    getCategories(true),
    reportByCategory(null, null, "out"),
    reportByCategory(null, null, "in"),
    getCurrentUser(),
  ]);
  const isAdmin = user?.role === "admin";
  const totals = new Map<string, { cents: number; count: number }>();
  for (const t of [...outTotals, ...inTotals]) {
    if (!t.categoryId) continue;
    const prev = totals.get(t.categoryId) ?? { cents: 0, count: 0 };
    totals.set(t.categoryId, { cents: prev.cents + t.cents, count: prev.count + t.count });
  }

  return (
    <>
      <PageHeader title="Categories" description={isAdmin ? "Add, rename or deactivate categories." : "Categories used to group transactions. Only admins can change them."} />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card divide-y divide-border lg:col-span-2">
          {categories.map((c) => {
            const t = totals.get(c.id);
            return (
              <div key={c.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <Link href={`/transactions?category=${c.id}`} className="font-medium text-slate-900 hover:text-brand">{c.name}</Link>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-muted">
                      <span>{APPLIES[c.applies_to]}</span>
                      <span>·</span>
                      <span className="tabular">{t ? `${formatMoney(t.cents)} in ${t.count} entries` : "No entries"}</span>
                      {!c.is_active && <Badge tone="amber">Inactive</Badge>}
                    </div>
                  </div>
                  {isAdmin && (
                    <form action={setCategoryActive.bind(null, c.id, !c.is_active)}>
                      <button className="btn-ghost min-h-9 px-3 text-xs">{c.is_active ? "Deactivate" : "Reactivate"}</button>
                    </form>
                  )}
                </div>
                {isAdmin && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs font-medium text-brand">Edit</summary>
                    <div className="mt-2">
                      <CategoryForm action={saveCategory.bind(null, c.id)} category={c} />
                    </div>
                  </details>
                )}
              </div>
            );
          })}
        </div>
        {isAdmin && (
          <Card title="Add category">
            <CategoryForm action={saveCategory.bind(null, null)} />
          </Card>
        )}
      </div>
    </>
  );
}
