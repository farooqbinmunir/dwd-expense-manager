import { z } from "zod";
import { centsToDecimal, parsePositiveAmount } from "@/lib/money";
import { isISODate } from "@/lib/dates";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Must be ${max} characters or fewer`)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional()
    .transform((v) => v ?? null);

const optionalUuid = z
  .string()
  .trim()
  // "__new__" is the "+ Add new person" option; the name arrives in new_paid_by / new_paid_to.
  .transform((v) => (v === "" || v === "__new__" ? null : v))
  .nullable()
  .optional()
  .transform((v) => v ?? null)
  .refine((v) => v === null || /^[0-9a-f-]{36}$/i.test(v), "Invalid selection");

export const transactionSchema = z.object({
  txn_date: z.string().refine(isISODate, "Enter a valid date"),
  type: z.enum(["in", "out"], { message: "Choose Money In or Money Out" }),
  amount: z
    .string()
    .trim()
    .refine((v) => parsePositiveAmount(v) !== null, "Enter an amount greater than 0 (max 2 decimals)")
    .transform((v) => centsToDecimal(parsePositiveAmount(v)!)),
  description: z.string().trim().min(1, "Description is required").max(1000),
  category_id: optionalUuid,
  payment_method: z
    .enum(["cash", "online", "card", "mixed", "other", ""])
    .optional()
    .transform((v) => (v ? v : null)),
  payment_method_detail: optionalText(200),
  paid_by_id: optionalUuid,
  paid_to_id: optionalUuid,
  new_paid_by: optionalText(120),
  new_paid_to: optionalText(120),
  notes: optionalText(2000),
});

export type TransactionInput = z.infer<typeof transactionSchema>;

export const personSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  kind: z
    .enum(["team", "vendor", "labour", "other", ""])
    .optional()
    .transform((v) => (v ? v : null)),
  phone: optionalText(40),
  notes: optionalText(1000),
});

export const categorySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  applies_to: z.enum(["in", "out", "both"]),
  sort_order: z.coerce.number().int().min(0).max(10000).default(100),
});

export const newUserSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  full_name: z.string().trim().min(1, "Name is required").max(120),
  role: z.enum(["admin", "member"]),
  password: z.string().min(8, "Password must be at least 8 characters").max(72),
});

export const passwordSchema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters").max(72),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: "Passwords do not match", path: ["confirm"] });

/** Turn FormData into a plain object of strings (first value wins). */
export function formToObject(fd: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of fd.entries()) {
    if (typeof v === "string" && !(k in out)) out[k] = v;
  }
  return out;
}

export function zodFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

export const ALLOWED_RECEIPT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "application/pdf",
];
export const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;
export const MAX_RECEIPTS_PER_UPLOAD = 5;

export function validateReceiptFile(f: File): string | null {
  if (!ALLOWED_RECEIPT_TYPES.includes(f.type)) return `${f.name}: only images (JPG, PNG, WEBP, HEIC) and PDF files are allowed`;
  if (f.size > MAX_RECEIPT_BYTES) return `${f.name}: file is larger than 10 MB`;
  if (f.size === 0) return `${f.name}: file is empty`;
  return null;
}
