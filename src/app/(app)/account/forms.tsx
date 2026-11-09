"use client";

import { useActionState } from "react";
import { Alert, Card, FieldError } from "@/components/ui";
import { changePassword, updateName, type FormState } from "./actions";

export function AccountForms({ fullName }: { fullName: string }) {
  const [nameState, nameAction, namePending] = useActionState<FormState, FormData>(updateName, {});
  const [pwState, pwAction, pwPending] = useActionState<FormState, FormData>(changePassword, {});
  return (
    <>
      <Card title="Your name">
        <form action={nameAction} className="space-y-3">
          {nameState.error && <Alert>{nameState.error}</Alert>}
          {nameState.ok && <Alert tone="success">{nameState.message}</Alert>}
          <input name="full_name" defaultValue={fullName} required maxLength={120} className="input" aria-label="Full name" />
          <button className="btn-primary" disabled={namePending}>{namePending ? "Saving…" : "Save name"}</button>
        </form>
      </Card>
      <Card title="Change password">
        <form action={pwAction} className="space-y-3">
          {pwState.error && <Alert>{pwState.error}</Alert>}
          {pwState.ok && <Alert tone="success">{pwState.message}</Alert>}
          <div>
            <label className="label" htmlFor="pw">New password</label>
            <input id="pw" name="password" type="password" minLength={8} maxLength={72} required autoComplete="new-password" className="input" />
            <FieldError message={pwState.fieldErrors?.password} />
          </div>
          <div>
            <label className="label" htmlFor="pw2">Confirm new password</label>
            <input id="pw2" name="confirm" type="password" required autoComplete="new-password" className="input" />
            <FieldError message={pwState.fieldErrors?.confirm} />
          </div>
          <button className="btn-primary" disabled={pwPending}>{pwPending ? "Saving…" : "Change password"}</button>
        </form>
      </Card>
    </>
  );
}
