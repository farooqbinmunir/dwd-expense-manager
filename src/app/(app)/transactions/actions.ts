"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formToObject, transactionSchema, zodFieldErrors, ALLOWED_RECEIPT_TYPES, MAX_RECEIPT_BYTES } from "@/lib/validation";

export type TxnFormState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  id?: string;
};

const UUID = /^[0-9a-f-]{36}$/i;

/** Find a person by name (case/space-insensitive) or create them. */
async function resolvePerson(supabase: SupabaseClient, userId: string, name: string): Promise<string> {
  const clean = name.replace(/\s+/g, " ").trim();
  const { data: existing } = await supabase.from("people").select("id, name").ilike("name", clean.replace(/[%_\\]/g, "\\$&"));
  const hit = (existing ?? []).find((p) => p.name.replace(/\s+/g, " ").trim().toLowerCase() === clean.toLowerCase());
  if (hit) return hit.id;
  const { data, error } = await supabase.from("people").insert({ name: clean, created_by: userId }).select("id").single();
  if (error) throw new Error(`Could not add person "${clean}": ${error.message}`);
  return data.id;
}

async function buildPayload(supabase: SupabaseClient, userId: string, fd: FormData) {
  const parsed = transactionSchema.safeParse(formToObject(fd));
  if (!parsed.success) return { fieldErrors: zodFieldErrors(parsed.error) };
  const v = parsed.data;
  const paid_by_id = v.new_paid_by ? await resolvePerson(supabase, userId, v.new_paid_by) : v.paid_by_id;
  const paid_to_id = v.new_paid_to ? await resolvePerson(supabase, userId, v.new_paid_to) : v.paid_to_id;
  return {
    payload: {
      txn_date: v.txn_date,
      type: v.type,
      amount: v.amount, // decimal string, e.g. "1234.50" — never a float
      description: v.description,
      category_id: v.category_id,
      payment_method: v.payment_method,
      payment_method_detail: v.payment_method_detail,
      paid_by_id,
      paid_to_id,
      notes: v.notes,
    },
  };
}

export async function createTransaction(_prev: TxnFormState, fd: FormData): Promise<TxnFormState> {
  const auth = await checkUser();
  if ("error" in auth) return { error: auth.error };
  const supabase = await createClient();
  try {
    const built = await buildPayload(supabase, auth.user.id, fd);
    if ("fieldErrors" in built) return { error: "Please fix the highlighted fields.", fieldErrors: built.fieldErrors };
    const { data, error } = await supabase
      .from("transactions")
      .insert({ ...built.payload, created_by: auth.user.id })
      .select("id")
      .single();
    if (error) return { error: `Could not save: ${error.message}` };
    revalidatePath("/", "layout");
    return { ok: true, id: data.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not save the transaction." };
  }
}

export async function updateTransaction(id: string, _prev: TxnFormState, fd: FormData): Promise<TxnFormState> {
  const auth = await checkUser();
  if ("error" in auth) return { error: auth.error };
  if (!UUID.test(id)) return { error: "Invalid transaction." };
  const supabase = await createClient();
  try {
    const built = await buildPayload(supabase, auth.user.id, fd);
    if ("fieldErrors" in built) return { error: "Please fix the highlighted fields.", fieldErrors: built.fieldErrors };
    const { data, error } = await supabase.from("transactions").update(built.payload).eq("id", id).select("id");
    if (error) return { error: `Could not save: ${error.message}` };
    if (!data?.length) return { error: "You don't have permission to edit this transaction (members can edit only their own entries)." };
    revalidatePath("/", "layout");
    return { ok: true, id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not save the transaction." };
  }
}

export async function deleteTransaction(id: string): Promise<{ error?: string }> {
  const auth = await checkUser(true);
  if ("error" in auth) return { error: auth.error };
  if (!UUID.test(id)) return { error: "Invalid transaction." };
  const supabase = await createClient();
  const { data: atts } = await supabase.from("attachments").select("storage_path").eq("transaction_id", id);
  const { data, error } = await supabase.from("transactions").delete().eq("id", id).select("id");
  if (error) return { error: `Could not delete: ${error.message}` };
  if (!data?.length) return { error: "Transaction not found or you are not allowed to delete it." };
  const paths = (atts ?? []).map((a) => a.storage_path).filter(Boolean) as string[];
  if (paths.length) await supabase.storage.from("receipts").remove(paths);
  revalidatePath("/", "layout");
  redirect("/transactions?deleted=1");
}

export interface UploadedReceipt {
  path: string;
  name: string;
  type: string;
  size: number;
}

/**
 * Record receipts that the browser has already uploaded straight to the private
 * bucket (RLS on storage checked the user may edit this transaction). We verify
 * each object exists under this transaction's folder before saving the row.
 */
export async function registerAttachments(transactionId: string, files: UploadedReceipt[]): Promise<{ error?: string; saved: number }> {
  const auth = await checkUser();
  if ("error" in auth) return { error: auth.error, saved: 0 };
  if (!UUID.test(transactionId)) return { error: "Invalid transaction.", saved: 0 };
  const supabase = await createClient();
  const { data: listing, error: listErr } = await supabase.storage.from("receipts").list(transactionId, { limit: 1000 });
  if (listErr) return { error: listErr.message, saved: 0 };
  const present = new Map((listing ?? []).map((o) => [`${transactionId}/${o.name}`, o]));

  const rows = [];
  for (const f of files.slice(0, 20)) {
    if (!f.path.startsWith(`${transactionId}/`) || f.path.includes("..")) return { error: "Invalid file path.", saved: 0 };
    const obj = present.get(f.path);
    if (!obj) return { error: `Upload of ${f.name} was not found in storage.`, saved: 0 };
    const meta = obj.metadata as { mimetype?: string; size?: number } | null;
    const mime = meta?.mimetype ?? f.type;
    if (!ALLOWED_RECEIPT_TYPES.includes(mime)) return { error: `${f.name}: file type not allowed.`, saved: 0 };
    const size = meta?.size ?? f.size;
    if (size > MAX_RECEIPT_BYTES) return { error: `${f.name}: file too large.`, saved: 0 };
    rows.push({
      transaction_id: transactionId,
      storage_path: f.path,
      file_name: f.name.slice(0, 255) || "receipt",
      mime_type: mime,
      size_bytes: size,
      uploaded_by: auth.user.id,
    });
  }
  if (!rows.length) return { saved: 0 };
  const { error } = await supabase.from("attachments").insert(rows);
  if (error) return { error: `Could not save receipts: ${error.message}`, saved: 0 };
  revalidatePath(`/transactions/${transactionId}`);
  return { saved: rows.length };
}

export async function deleteAttachment(attachmentId: string): Promise<{ error?: string }> {
  const auth = await checkUser();
  if ("error" in auth) return { error: auth.error };
  if (!UUID.test(attachmentId)) return { error: "Invalid attachment." };
  const supabase = await createClient();
  const { data: att } = await supabase.from("attachments").select("id, transaction_id, storage_path").eq("id", attachmentId).maybeSingle();
  if (!att) return { error: "Attachment not found." };
  const { data, error } = await supabase.from("attachments").delete().eq("id", attachmentId).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "You are not allowed to remove this receipt." };
  if (att.storage_path) await supabase.storage.from("receipts").remove([att.storage_path]);
  revalidatePath(`/transactions/${att.transaction_id}`);
  return {};
}
