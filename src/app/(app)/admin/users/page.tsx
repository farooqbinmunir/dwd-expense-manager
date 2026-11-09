import type { Metadata } from "next";
import { Alert, Badge, Card, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { formatDateTime } from "@/lib/dates";
import { hasAdminKey } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { AccessControls, NewUserForm, ResetPassword } from "./user-forms";

export const metadata: Metadata = { title: "Users" };

export default async function UsersPage() {
  const me = await requireAdmin();
  const supabase = await createClient();
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, is_active, created_at")
    .order("created_at");
  const keyConfigured = hasAdminKey();

  return (
    <>
      <PageHeader title="Users" description="Only people with an account here can sign in. New accounts are active immediately." />
      {!keyConfigured && (
        <div className="mb-4">
          <Alert tone="warning">
            SUPABASE_SERVICE_ROLE_KEY is not set on the server, so new users can’t be created and passwords can’t be reset from here. Role and activation changes still work.
          </Alert>
        </div>
      )}
      {error && <Alert>{error.message}</Alert>}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card divide-y divide-border lg:col-span-2">
          {(profiles ?? []).map((p) => (
            <div key={p.id} className="px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{p.full_name || p.email}</p>
                  <p className="truncate text-xs text-muted">{p.email} · added {formatDateTime(p.created_at)}</p>
                  <div className="mt-1 flex gap-1.5">
                    <Badge tone={p.role === "admin" ? "blue" : "slate"}>{p.role === "admin" ? "Admin" : "Member"}</Badge>
                    {p.is_active ? <Badge tone="green">Active</Badge> : <Badge tone="amber">Inactive</Badge>}
                  </div>
                </div>
                <AccessControls userId={p.id} role={p.role} isActive={p.is_active} isSelf={p.id === me.id} />
              </div>
              {keyConfigured && p.id !== me.id && <ResetPassword userId={p.id} />}
            </div>
          ))}
        </div>
        <Card title="Add a user">
          {keyConfigured ? <NewUserForm /> : <p className="text-sm text-muted">Configure the service-role key to add users from the app (see README), or add them in the Supabase dashboard and activate them here.</p>}
        </Card>
      </div>
    </>
  );
}
