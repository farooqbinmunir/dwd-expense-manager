"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { error?: string; email?: string };

function safeNext(next: unknown): string {
  // Only allow same-site relative paths (prevents open redirects).
  if (typeof next === "string" && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")) return next;
  return "/";
}

export async function signIn(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password.", email };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    // Generic message: don't reveal whether the account exists.
    return { error: "Incorrect email or password.", email };
  }
  redirect(safeNext(formData.get("next")));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
