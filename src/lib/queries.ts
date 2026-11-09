import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isISODate } from "@/lib/dates";
import { centsToDecimal, dbToCents, parsePositiveAmount } from "@/lib/money";
import type { Attachment, Category, Person, TransactionRow } from "@/lib/types";

export const PAGE_SIZE = 25;

export interface TxnFilters {
  q?: string;
  from?: string;
  to?: string;
  type?: "in" | "out";
  category?: string; // uuid or "none"
  method?: string;
  person?: string;
  sort?: "date_desc" | "date_asc" | "amount_desc" | "amount_asc";
  page?: number;
}

const UUID = /^[0-9a-f-]{36}$/i;
const METHODS = ["cash", "online", "card", "mixed", "other", "none"];

export function parseFilters(sp: Record<string, string | string[] | undefined>): TxnFilters {
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).trim() : undefined);
  const f: TxnFilters = {};
  const q = s("q");
  if (q) f.q = q.slice(0, 100);
  if (isISODate(s("from"))) f.from = s("from");
  if (isISODate(s("to"))) f.to = s("to");
  if (s("type") === "in" || s("type") === "out") f.type = s("type") as "in" | "out";
  const cat = s("category");
  if (cat && (cat === "none" || UUID.test(cat))) f.category = cat;
  const m = s("method");
  if (m && METHODS.includes(m)) f.method = m;
  const p = s("person");
  if (p && UUID.test(p)) f.person = p;
  const sort = s("sort");
  if (sort === "date_asc" || sort === "amount_desc" || sort === "amount_asc" || sort === "date_desc") f.sort = sort;
  const page = Number(s("page"));
  if (Number.isInteger(page) && page > 1) f.page = page;
  return f;
}

/** Characters that have meaning in PostgREST filter strings are removed. */
function sanitiseSearch(q: string): string {
  return q.replace(/[,()*%\\"':]/g, " ").replace(/\s+/g, " ").trim();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyFilters(query: any, f: TxnFilters) {
  if (f.from) query = query.gte("txn_date", f.from);
  if (f.to) query = query.lte("txn_date", f.to);
  if (f.type) query = query.eq("type", f.type);
  if (f.category === "none") query = query.is("category_id", null);
  else if (f.category) query = query.eq("category_id", f.category);
  if (f.method === "none") query = query.is("payment_method", null);
  else if (f.method) query = query.eq("payment_method", f.method);

  const ors: string[] = [];
  if (f.person) ors.push(`or(paid_by_id.eq.${f.person},paid_to_id.eq.${f.person})`);
  if (f.q) {
    const term = sanitiseSearch(f.q);
    if (term) {
      const parts = [
        `description.ilike."*${term}*"`,
        `notes.ilike."*${term}*"`,
        `paid_by_name.ilike."*${term}*"`,
        `paid_to_name.ilike."*${term}*"`,
        `category_name.ilike."*${term}*"`,
        `payment_method_detail.ilike."*${term}*"`,
      ];
      const cents = parsePositiveAmount(term);
      if (cents !== null) parts.push(`amount.eq."${centsToDecimal(cents)}"`);
      const txnNo = /^(?:txn-?)?0*(\d{1,9})$/i.exec(term);
      if (txnNo) parts.push(`txn_no.eq.${txnNo[1]}`);
      ors.push(`or(${parts.join(",")})`);
    }
  }
  if (ors.length === 1) query = query.or(ors[0].slice(3, -1));
  else if (ors.length > 1) query = query.or(`and(${ors.join(",")})`);
  return query;
}

export async function listTransactions(f: TxnFilters) {
  const supabase = await createClient();
  const page = f.page ?? 1;
  let query = supabase.from("transactions_view").select("*", { count: "exact" });
  query = applyFilters(query, f);
  switch (f.sort) {
    case "date_asc":
      query = query.order("txn_date", { ascending: true }).order("txn_no", { ascending: true });
      break;
    case "amount_desc":
      query = query.order("amount", { ascending: false }).order("txn_no", { ascending: false });
      break;
    case "amount_asc":
      query = query.order("amount", { ascending: true }).order("txn_no", { ascending: true });
      break;
    default:
      query = query.order("txn_date", { ascending: false }).order("txn_no", { ascending: false });
  }
  query = query.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  const { data, error, count } = await query;
  if (error) throw new Error(`Could not load transactions: ${error.message}`);
  return { rows: (data ?? []) as TransactionRow[], total: count ?? 0, page };
}

/** All matching rows (for CSV export / reports). Paged internally to avoid the API row cap. */
export async function listAllTransactions(f: TxnFilters): Promise<TransactionRow[]> {
  const supabase = await createClient();
  const out: TransactionRow[] = [];
  const chunk = 1000;
  for (let offset = 0; ; offset += chunk) {
    let query = supabase.from("transactions_view").select("*");
    query = applyFilters(query, f);
    const { data, error } = await query
      .order("txn_date", { ascending: true })
      .order("txn_no", { ascending: true })
      .range(offset, offset + chunk - 1);
    if (error) throw new Error(`Could not load transactions: ${error.message}`);
    out.push(...((data ?? []) as TransactionRow[]));
    if (!data || data.length < chunk) break;
  }
  return out;
}

/** Totals for an arbitrary filter set (computed from the rows, exactly in cents). */
export function totalsOf(rows: Pick<TransactionRow, "type" | "amount">[]) {
  let inC = 0;
  let outC = 0;
  for (const r of rows) {
    if (r.type === "in") inC += dbToCents(r.amount);
    else outC += dbToCents(r.amount);
  }
  return { inCents: inC, outCents: outC, netCents: inC - outC };
}

export async function getTransaction(id: string) {
  if (!UUID.test(id)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from("transactions_view").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data as TransactionRow | null;
}

export async function getAttachments(transactionId: string): Promise<(Attachment & { url: string | null; downloadUrl: string | null })[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("attachments")
    .select("*")
    .eq("transaction_id", transactionId)
    .order("created_at");
  if (error) throw new Error(error.message);
  const list = (data ?? []) as Attachment[];
  const paths = list.map((a) => a.storage_path).filter((p): p is string => Boolean(p));
  const signed = new Map<string, string>();
  const signedDl = new Map<string, string>();
  if (paths.length) {
    const bucket = supabase.storage.from("receipts");
    const { data: urls } = await bucket.createSignedUrls(paths, 60 * 60);
    for (const u of urls ?? []) if (u.path && u.signedUrl) signed.set(u.path, u.signedUrl);
    const { data: dl } = await bucket.createSignedUrls(paths, 60 * 60, { download: true });
    for (const u of dl ?? []) if (u.path && u.signedUrl) signedDl.set(u.path, u.signedUrl);
  }
  return list.map((a) => ({
    ...a,
    url: a.storage_path ? signed.get(a.storage_path) ?? null : a.external_url,
    downloadUrl: a.storage_path ? signedDl.get(a.storage_path) ?? null : a.external_url,
  }));
}

export async function getPeople(includeInactive = false): Promise<Person[]> {
  const supabase = await createClient();
  let q = supabase.from("people").select("id, name, kind, phone, notes, is_active").order("name");
  if (!includeInactive) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as Person[];
}

export async function getCategories(includeInactive = false): Promise<Category[]> {
  const supabase = await createClient();
  let q = supabase.from("categories").select("id, name, applies_to, sort_order, is_active").order("sort_order").order("name");
  if (!includeInactive) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as Category[];
}

// ------------------------------------------------------------------ reports
export interface Totals {
  inCents: number;
  outCents: number;
  balanceCents: number;
  count: number;
  inCount: number;
  outCount: number;
}

export async function reportTotals(from: string | null, to: string | null): Promise<Totals> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("report_totals", { p_from: from, p_to: to }).single();
  if (error) throw new Error(error.message);
  const d = data as { total_in: string; total_out: string; balance: string; txn_count: number; in_count: number; out_count: number };
  return {
    inCents: dbToCents(d.total_in),
    outCents: dbToCents(d.total_out),
    balanceCents: dbToCents(d.balance),
    count: Number(d.txn_count),
    inCount: Number(d.in_count),
    outCount: Number(d.out_count),
  };
}

export interface CategoryTotal {
  categoryId: string | null;
  name: string;
  cents: number;
  count: number;
}

export async function reportByCategory(from: string | null, to: string | null, type: "in" | "out" = "out"): Promise<CategoryTotal[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("report_by_category", { p_from: from, p_to: to, p_type: type });
  if (error) throw new Error(error.message);
  return ((data ?? []) as { category_id: string | null; category_name: string; total: string; txn_count: number }[]).map((r) => ({
    categoryId: r.category_id,
    name: r.category_name,
    cents: dbToCents(r.total),
    count: Number(r.txn_count),
  }));
}

export interface PeriodTotal {
  period: string;
  inCents: number;
  outCents: number;
  count: number;
}

export async function reportByPeriod(from: string | null, to: string | null, grain: "day" | "week" | "month"): Promise<PeriodTotal[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("report_by_period", { p_from: from, p_to: to, p_grain: grain });
  if (error) throw new Error(error.message);
  return ((data ?? []) as { period: string; total_in: string; total_out: string; txn_count: number }[]).map((r) => ({
    period: r.period,
    inCents: dbToCents(r.total_in),
    outCents: dbToCents(r.total_out),
    count: Number(r.txn_count),
  }));
}

export interface PersonTotal {
  personId: string;
  name: string;
  paidInCents: number; // money this person provided (Money In, as payer)
  paidOutCents: number; // money this person paid out (Money Out, as payer)
  receivedInCents: number; // Money In received by this person
  receivedOutCents: number; // Money Out paid to this person
  count: number;
}

export async function reportByPerson(from: string | null, to: string | null): Promise<PersonTotal[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("report_by_person", { p_from: from, p_to: to });
  if (error) throw new Error(error.message);
  return (
    (data ?? []) as {
      person_id: string;
      person_name: string;
      paid_in: string;
      paid_out: string;
      received_in: string;
      received_out: string;
      txn_count: number;
    }[]
  ).map((r) => ({
    personId: r.person_id,
    name: r.person_name,
    paidInCents: dbToCents(r.paid_in),
    paidOutCents: dbToCents(r.paid_out),
    receivedInCents: dbToCents(r.received_in),
    receivedOutCents: dbToCents(r.received_out),
    count: Number(r.txn_count),
  }));
}
