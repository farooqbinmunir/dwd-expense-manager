import type { TxnType } from "@/lib/money";

export type PaymentMethod = "cash" | "online" | "card" | "mixed" | "other";

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "online", label: "Online / Bank" },
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "mixed", label: "Mixed" },
  { value: "other", label: "Other" },
];

export function paymentMethodLabel(m: string | null): string {
  return PAYMENT_METHODS.find((p) => p.value === m)?.label ?? "—";
}

export const PERSON_KINDS = [
  { value: "team", label: "Team member" },
  { value: "vendor", label: "Vendor / shop" },
  { value: "labour", label: "Labour" },
  { value: "other", label: "Other" },
] as const;

/** Row of public.transactions_view (numeric columns arrive as strings). */
export interface TransactionRow {
  id: string;
  txn_no: number;
  txn_date: string;
  type: TxnType;
  amount: string;
  signed_amount: string;
  running_balance: string;
  description: string | null;
  category_id: string | null;
  category_name: string | null;
  category_inferred: boolean;
  payment_method: PaymentMethod | null;
  payment_method_detail: string | null;
  paid_by_id: string | null;
  paid_by_name: string | null;
  paid_to_id: string | null;
  paid_to_name: string | null;
  notes: string | null;
  source: "app" | "sheet_import" | "csv_import";
  source_ref: string | null;
  source_row: number | null;
  source_raw: Record<string, unknown> | null;
  date_inferred: boolean;
  created_by: string | null;
  created_by_name: string | null;
  created_by_email: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
  attachment_count: number;
}

export interface Person {
  id: string;
  name: string;
  kind: string | null;
  phone: string | null;
  notes: string | null;
  is_active: boolean;
}

export interface Category {
  id: string;
  name: string;
  applies_to: "in" | "out" | "both";
  sort_order: number;
  is_active: boolean;
}

export interface Attachment {
  id: string;
  transaction_id: string;
  storage_path: string | null;
  external_url: string | null;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  source_ref: string | null;
  created_at: string;
}

export function txnCode(no: number): string {
  return `TXN-${String(no).padStart(5, "0")}`;
}

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string; fieldErrors?: Record<string, string> };
