"use server";

import { revalidatePath } from "next/cache";
import { checkUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { formToObject, newUserSchema, zodFieldErrors } from "@/lib/validation";

export type FormState = { ok?: boolean; error?: string; message?: string; fieldErrors?: Record<string, string> };
const UUID = /^[0-9a-f-]{36}$/i;

/** Admin creates an account with an initial password and shares it privately with the person. */
export async function createUser(_prev: FormState, fd: FormData): Promise<FormState> {
  const auth = await checkUser(true);
  if ("error" in auth) return { error: auth.error };
  const parsed = newUserSchema.safeParse(formToObject(fd));
  if (!parsed.success) return { error: "Please fix the highlighted fields.", fieldErrors: zodFieldErrors(parsed.error) };
  const { email, full_name, role, password } = parsed.data;

  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    return { error: (e as Error).message };
  }
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name },
  });
  if (error || !data.user) {
    return { error: /already|registered|exists/i.test(error?.message ?? "") ? "An account with this email already exists." : `Could not create user: ${error?.message}` };
  }
  // The auth trigger created an inactive member profile; activate it with the chosen role.
  const { error: pErr } = await admin.from("profiles").update({ full_name, role, is_active: true }).eq("id", data.user.id);
  if (pErr) return { error: `User created but profile could not be activated: ${pErr.message}` };
  revalidatePath("/admin/users");
  return { ok: true, message: `${email} can now sign in with the password you set. Share it privately and ask them to change it under “My account”.` };
}

export async function updateUserAccess(userId: string, changes: { role?: "admin" | "member"; is_active?: boolean }): Promise<{ error?: string }> {
  const auth = await checkUser(true);
  if ("error" in auth) return { error: auth.error };
  if (!UUID.test(userId)) return { error: "Invalid user." };
  if (userId === auth.user.id && (changes.is_active === false || changes.role === "member")) {
    return { error: "You cannot remove your own admin access. Ask another admin to do it." };
  }
  // Runs as the signed-in admin: RLS + the protect_profile trigger apply (incl. "keep one admin").
  const supabase = await createClient();
  const { data, error } = await supabase.from("profiles").update(changes).eq("id", userId).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "Not allowed or user not found." };
  revalidatePath("/admin/users");
  return {};
}

export async function resetUserPassword(userId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const auth = await checkUser(true);
  if ("error" in auth) return { error: auth.error };
  if (!UUID.test(userId)) return { error: "Invalid user." };
  const password = String(fd.get("password") ?? "");
  if (password.length < 8 || password.length > 72) return { error: "Password must be 8–72 characters." };
  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    return { error: (e as Error).message };
  }
  const { error } = await admin.auth.admin.updateUserById(userId, { password });
  if (error) return { error: error.message };
  return { ok: true, message: "Password updated. Share it privately with the user." };
}
