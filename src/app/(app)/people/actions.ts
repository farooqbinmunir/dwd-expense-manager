"use server";

import { revalidatePath } from "next/cache";
import { checkUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formToObject, personSchema, zodFieldErrors } from "@/lib/validation";

export type FormState = { ok?: boolean; error?: string; message?: string; fieldErrors?: Record<string, string> };
const UUID = /^[0-9a-f-]{36}$/i;

function friendly(msg: string) {
  return /people_name_key|duplicate key/.test(msg) ? "A person with this name already exists." : msg;
}

export async function createPerson(_prev: FormState, fd: FormData): Promise<FormState> {
  const auth = await checkUser();
  if ("error" in auth) return { error: auth.error };
  const parsed = personSchema.safeParse(formToObject(fd));
  if (!parsed.success) return { error: "Please fix the highlighted fields.", fieldErrors: zodFieldErrors(parsed.error) };
  const supabase = await createClient();
  const { error } = await supabase.from("people").insert({ ...parsed.data, name: parsed.data.name.replace(/\s+/g, " "), created_by: auth.user.id });
  if (error) return { error: friendly(error.message) };
  revalidatePath("/people");
  return { ok: true, message: `${parsed.data.name} added.` };
}

export async function updatePerson(id: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const auth = await checkUser(true);
  if ("error" in auth) return { error: auth.error };
  if (!UUID.test(id)) return { error: "Invalid person." };
  const parsed = personSchema.safeParse(formToObject(fd));
  if (!parsed.success) return { error: "Please fix the highlighted fields.", fieldErrors: zodFieldErrors(parsed.error) };
  const supabase = await createClient();
  const { data, error } = await supabase.from("people").update({ ...parsed.data, name: parsed.data.name.replace(/\s+/g, " ") }).eq("id", id).select("id");
  if (error) return { error: friendly(error.message) };
  if (!data?.length) return { error: "Not allowed or not found." };
  revalidatePath("/people");
  revalidatePath(`/people/${id}`);
  return { ok: true, message: "Saved." };
}

export async function setPersonActive(id: string, active: boolean): Promise<void> {
  const auth = await checkUser(true);
  if ("error" in auth || !UUID.test(id)) return;
  const supabase = await createClient();
  await supabase.from("people").update({ is_active: active }).eq("id", id);
  revalidatePath("/people");
  revalidatePath(`/people/${id}`);
}
