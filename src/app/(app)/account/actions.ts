"use server";

import { revalidatePath } from "next/cache";
import { checkUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { passwordSchema, zodFieldErrors } from "@/lib/validation";

export type FormState = { ok?: boolean; error?: string; message?: string; fieldErrors?: Record<string, string> };

export async function updateName(_prev: FormState, fd: FormData): Promise<FormState> {
  const auth = await checkUser();
  if ("error" in auth) return { error: auth.error };
  const name = String(fd.get("full_name") ?? "").trim();
  if (!name || name.length > 120) return { error: "Enter a name (max 120 characters)." };
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ full_name: name }).eq("id", auth.user.id);
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: true, message: "Name updated." };
}

export async function changePassword(_prev: FormState, fd: FormData): Promise<FormState> {
  const auth = await checkUser();
  if ("error" in auth) return { error: auth.error };
  const parsed = passwordSchema.safeParse({ password: fd.get("password"), confirm: fd.get("confirm") });
  if (!parsed.success) return { error: "Please fix the highlighted fields.", fieldErrors: zodFieldErrors(parsed.error) };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: error.message };
  return { ok: true, message: "Password changed." };
}
