import { redirect } from "next/navigation";
import { signOut } from "@/app/auth-actions";
import { getCurrentUser } from "@/lib/auth";

export default async function InactivePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.isActive) redirect("/");
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="card w-full max-w-sm p-6 text-center">
        <h1 className="text-lg font-semibold">Account not active</h1>
        <p className="mt-2 text-sm text-muted">
          You are signed in as <strong>{user.email}</strong>, but this account has not been activated (or has been
          deactivated). Please ask the project admin to activate it.
        </p>
        <form action={signOut} className="mt-5">
          <button className="btn-secondary w-full">Sign out</button>
        </form>
      </div>
    </main>
  );
}
