"use server";

import { revalidatePath } from "next/cache";
import { checkUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { categorySchema, formToObject, zodFieldErrors } from "@/lib/validation";

export type FormState = { ok?: boolean; error?: string; message?: string; fieldErrors?: Record<string, string> };
const UUID = /^[0-9a-f-]{36}$/i;
const friendly = (m: string) => (/categories_name_key|duplicate key/.test(m) ? "A category with this name already exists." : m);

export async function saveCategory(id: string | null, _prev: FormState, fd: FormData): Promise<FormState> {
  const auth = await checkUser(true);
  if ("error" in auth) return { error: auth.error };
  const parsed = categorySchema.safeParse(formToObject(fd));
  if (!parsed.success) return { error: "Please fix the highlighted fields.", fieldErrors: zodFieldErrors(parsed.error) };
  const supabase = await createClient();
  if (id) {
    if (!UUID.test(id)) return { error: "Invalid category." };
    const { error } = await supabase.from("categories").update(parsed.data).eq("id", id);
    if (error) return { error: friendly(error.message) };
  } else {
    const { error } = await supabase.from("categories").insert(parsed.data);
    if (error) return { error: friendly(error.message) };
  }
  revalidatePath("/categories");
  return { ok: true, message: id ? "Saved." : `${parsed.data.name} added.` };
}

export async function setCategoryActive(id: string, active: boolean): Promise<void> {
  const auth = await checkUser(true);
  if ("error" in auth || !UUID.test(id)) return;
  const supabase = await createClient();
  await supabase.from("categories").update({ is_active: active }).eq("id", id);
  revalidatePath("/categories");
}
