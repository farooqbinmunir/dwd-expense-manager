"use client";

import { useActionState, useEffect, useRef } from "react";
import { Alert, FieldError } from "@/components/ui";
import { PERSON_KINDS, type Person } from "@/lib/types";
import type { FormState } from "./actions";

export function PersonForm({
  action,
  person,
  submitLabel,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  person?: Person;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok && !person) ref.current?.reset();
  }, [state, person]);
  const fe = state.fieldErrors ?? {};
  return (
    <form ref={ref} action={formAction} className="space-y-3">
      {state.error && <Alert>{state.error}</Alert>}
      {state.ok && state.message && <Alert tone="success">{state.message}</Alert>}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="p-name">Name</label>
          <input id="p-name" name="name" required maxLength={120} defaultValue={person?.name} className="input" />
          <FieldError message={fe.name} />
        </div>
        <div>
          <label className="label" htmlFor="p-kind">Type</label>
          <select id="p-kind" name="kind" defaultValue={person?.kind ?? ""} className="input">
            <option value="">Not specified</option>
            {PERSON_KINDS.map((k) => (
              <option key={k.value} value={k.value}>{k.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="p-phone">Phone <span className="font-normal text-muted">(optional)</span></label>
          <input id="p-phone" name="phone" type="tel" maxLength={40} defaultValue={person?.phone ?? ""} className="input" />
          <FieldError message={fe.phone} />
        </div>
        <div>
          <label className="label" htmlFor="p-notes">Notes <span className="font-normal text-muted">(optional)</span></label>
          <input id="p-notes" name="notes" maxLength={1000} defaultValue={person?.notes ?? ""} className="input" />
        </div>
      </div>
      <button className="btn-primary" disabled={pending}>{pending ? "Saving…" : submitLabel}</button>
    </form>
  );
}
