"use client";

import { createBrowserSupabase } from "@/lib/supabase/browser";
import { registerAttachments, type UploadedReceipt } from "@/app/(app)/transactions/actions";
import { validateReceiptFile } from "@/lib/validation";

const MAX_EDGE = 2000;

/** Downscale large JPEG/PNG/WEBP photos in the browser (phone photos are often 4–8 MB). */
async function shrinkImage(file: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 900_000) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file; // fall back to the original
  }
}

function safeName(name: string): string {
  const cleaned = name.normalize("NFKD").replace(/[^\w.\-]+/g, "_").replace(/_+/g, "_").slice(-80);
  return cleaned || "receipt";
}

/**
 * Upload receipts straight to the private "receipts" bucket under
 * "<transactionId>/…" and then record them. Returns an error message or null.
 */
export async function uploadReceipts(transactionId: string, files: File[]): Promise<string | null> {
  if (!files.length) return null;
  for (const f of files) {
    const err = validateReceiptFile(f);
    if (err) return err;
  }
  const supabase = createBrowserSupabase();
  const uploaded: UploadedReceipt[] = [];
  for (const original of files) {
    const file = await shrinkImage(original);
    const path = `${transactionId}/${crypto.randomUUID()}-${safeName(file.name)}`;
    const { error } = await supabase.storage.from("receipts").upload(path, file, {
      contentType: file.type,
      upsert: false,
    });
    if (error) return `Upload failed for ${original.name}: ${error.message}`;
    uploaded.push({ path, name: original.name, type: file.type, size: file.size });
  }
  const res = await registerAttachments(transactionId, uploaded);
  return res.error ?? null;
}
