import type { Metadata } from "next";
import { signOut } from "@/app/auth-actions";
import { Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { AccountForms } from "./forms";

export const metadata: Metadata = { title: "My account" };

export default async function AccountPage() {
  const user = await requireUser();
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <PageHeader title="My account" description={`${user.email} · ${user.role === "admin" ? "Admin" : "Member"}`} />
      <AccountForms fullName={user.fullName ?? ""} />
      <Card title="Sign out">
        <form action={signOut}>
          <button className="btn-secondary">Sign out of this device</button>
        </form>
      </Card>
    </div>
  );
}
