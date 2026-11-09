"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Alert, FieldError } from "@/components/ui";
import { createUser, resetUserPassword, updateUserAccess, type FormState } from "./actions";

export function NewUserForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(createUser, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  const fe = state.fieldErrors ?? {};
  return (
    <form ref={ref} action={action} className="space-y-3">
      {state.error && <Alert>{state.error}</Alert>}
      {state.ok && <Alert tone="success">{state.message}</Alert>}
      <div>
        <label className="label" htmlFor="u-name">Full name</label>
        <input id="u-name" name="full_name" required maxLength={120} className="input" />
        <FieldError message={fe.full_name} />
      </div>
      <div>
        <label className="label" htmlFor="u-email">Email</label>
        <input id="u-email" name="email" type="email" required autoComplete="off" className="input" />
        <FieldError message={fe.email} />
      </div>
      <div>
        <label className="label" htmlFor="u-role">Role</label>
        <select id="u-role" name="role" defaultValue="member" className="input">
          <option value="member">Member – add transactions, view everything, edit own entries</option>
          <option value="admin">Admin – full control incl. users and deletions</option>
        </select>
      </div>
      <div>
        <label className="label" htmlFor="u-pass">Initial password</label>
        <input id="u-pass" name="password" type="text" minLength={8} maxLength={72} required autoComplete="new-password" className="input font-mono" />
        <FieldError message={fe.password} />
        <p className="mt-1 text-xs text-muted">At least 8 characters. Share it privately; they can change it after signing in.</p>
      </div>
      <button className="btn-primary" disabled={pending}>{pending ? "Creating…" : "Create user"}</button>
    </form>
  );
}

export function AccessControls({ userId, role, isActive, isSelf }: { userId: string; role: "admin" | "member"; isActive: boolean; isSelf: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (changes: { role?: "admin" | "member"; is_active?: boolean }) =>
    start(async () => {
      setError(null);
      const res = await updateUserAccess(userId, changes);
      if (res.error) setError(res.error);
    });
  if (isSelf) return <span className="text-xs text-muted">This is you</span>;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" disabled={pending} className="btn-secondary min-h-9 px-3 text-xs" onClick={() => run({ role: role === "admin" ? "member" : "admin" })}>
        {role === "admin" ? "Make member" : "Make admin"}
      </button>
      <button
        type="button"
        disabled={pending}
        className={`btn-secondary min-h-9 px-3 text-xs ${isActive ? "text-amber-700" : "text-green-700"}`}
        onClick={() => run({ is_active: !isActive })}
      >
        {isActive ? "Deactivate" : "Activate"}
      </button>
      {error && <span className="w-full text-xs text-red-600">{error}</span>}
    </div>
  );
}

export function ResetPassword({ userId }: { userId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(resetUserPassword.bind(null, userId), {});
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-xs font-medium text-brand">Set new password</summary>
      <form action={action} className="mt-2 flex flex-wrap gap-2">
        <input name="password" type="text" minLength={8} maxLength={72} required placeholder="New password" className="input min-h-9 max-w-56 font-mono" />
        <button className="btn-secondary min-h-9 px-3 text-xs" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
        {state.error && <p className="w-full text-xs text-red-600">{state.error}</p>}
        {state.ok && <p className="w-full text-xs text-green-700">{state.message}</p>}
      </form>
    </details>
  );
}
