"use client";

import { useActionState, useEffect, useRef } from "react";
import { Alert, FieldError } from "@/components/ui";
import type { Category } from "@/lib/types";
import type { FormState } from "./actions";

export function CategoryForm({
  action,
  category,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  category?: Category;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok && !category) ref.current?.reset();
  }, [state, category]);
  return (
    <form ref={ref} action={formAction} className="space-y-3">
      {state.error && <Alert>{state.error}</Alert>}
      {state.ok && state.message && <Alert tone="success">{state.message}</Alert>}
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
        <div>
          <label className="label">Name</label>
          <input name="name" required maxLength={80} defaultValue={category?.name} className="input" />
          <FieldError message={state.fieldErrors?.name} />
        </div>
        <div>
          <label className="label">Used for</label>
          <select name="applies_to" defaultValue={category?.applies_to ?? "out"} className="input">
            <option value="out">Money Out</option>
            <option value="in">Money In</option>
            <option value="both">Both</option>
          </select>
        </div>
        <div>
          <label className="label">Order</label>
          <input name="sort_order" type="number" min={0} max={10000} defaultValue={category?.sort_order ?? 100} className="input w-24" />
        </div>
      </div>
      <button className="btn-primary" disabled={pending}>{pending ? "Saving…" : category ? "Save" : "Add category"}</button>
    </form>
  );
}
