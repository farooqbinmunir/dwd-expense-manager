import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : undefined;
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand text-lg font-bold text-white">D</div>
          <h1 className="text-xl font-semibold">DWD Expense Manager</h1>
          <p className="mt-1 text-sm text-muted">Office construction ledger · authorised users only</p>
        </div>
        <div className="card p-5">
          <LoginForm next={next} />
        </div>
        <p className="mt-4 text-center text-xs text-muted">Need access? Ask the project admin to create an account for you.</p>
      </div>
    </main>
  );
}
