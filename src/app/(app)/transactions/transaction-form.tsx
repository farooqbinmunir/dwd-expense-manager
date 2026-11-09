"use client";

import { useRef, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, FieldError } from "@/components/ui";
import { PAYMENT_METHODS, type Category, type Person } from "@/lib/types";
import { uploadReceipts } from "@/lib/receipt-upload";
import { MAX_RECEIPTS_PER_UPLOAD, validateReceiptFile } from "@/lib/validation";
import type { TxnFormState } from "./actions";

export interface TxnDefaults {
  txn_date: string;
  type: "in" | "out";
  amount: string;
  description: string;
  category_id: string;
  payment_method: string;
  payment_method_detail: string;
  paid_by_id: string;
  paid_to_id: string;
  notes: string;
}

const NEW = "__new__";
const LAST_KEY = "dwd:last-entry";

const noopSubscribe = () => () => {};
function readLastEntry(): string | null {
  try {
    return localStorage.getItem(LAST_KEY);
  } catch {
    return null; // storage unavailable (private mode etc.)
  }
}

export function TransactionForm({
  mode,
  defaults,
  people,
  categories,
  action,
  cancelHref,
}: {
  mode: "create" | "edit";
  defaults: TxnDefaults;
  people: Person[];
  categories: Category[];
  action: (prev: TxnFormState, fd: FormData) => Promise<TxnFormState>;
  cancelHref: string;
}) {
  const router = useRouter();
  const [type, setType] = useState<"in" | "out">(defaults.type);
  // Remember the last payer / method on this device to speed up entry (create mode only).
  const lastRaw = useSyncExternalStore(noopSubscribe, readLastEntry, () => null);
  let last: { paid_by_id?: string; payment_method?: string } = {};
  try {
    last = mode === "create" && lastRaw ? JSON.parse(lastRaw) : {};
  } catch {
    /* ignore malformed value */
  }
  const [methodChoice, setMethod] = useState<string | null>(null);
  const [paidByChoice, setPaidBy] = useState<string | null>(null);
  const method = methodChoice ?? last.payment_method ?? defaults.payment_method;
  const paidBy =
    paidByChoice ?? (last.paid_by_id && people.some((p) => p.id === last.paid_by_id) ? last.paid_by_id : defaults.paid_by_id);
  const [paidTo, setPaidTo] = useState(defaults.paid_to_id);
  const [categoryId, setCategoryId] = useState(defaults.category_id);
  const [files, setFiles] = useState<File[]>([]);
  const [state, setState] = useState<TxnFormState>({});
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  const visibleCategories = categories.filter((c) => c.applies_to === "both" || c.applies_to === type || c.id === categoryId);
  const fe = state.fieldErrors ?? {};

  function onFiles(list: FileList | null) {
    if (!list) return;
    const next = [...files, ...Array.from(list)].slice(0, MAX_RECEIPTS_PER_UPLOAD);
    const bad = next.map(validateReceiptFile).find(Boolean);
    setState(bad ? { error: bad } : {});
    if (!bad) setFiles(next);
    if (fileInput.current) fileInput.current.value = "";
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.delete("receipts"); // files go straight to storage, not through the server
    startTransition(async () => {
      setStatus("Saving…");
      const res = await action({}, fd);
      if (!res.ok || !res.id) {
        setState(res);
        setStatus(null);
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      if (mode === "create") {
        try {
          localStorage.setItem(LAST_KEY, JSON.stringify({ paid_by_id: paidBy !== NEW ? paidBy : "", payment_method: method }));
        } catch {
          /* ignore */
        }
      }
      if (files.length) {
        setStatus(`Uploading ${files.length} receipt${files.length > 1 ? "s" : ""}…`);
        const err = await uploadReceipts(res.id, files);
        if (err) {
          router.push(`/transactions/${res.id}?saved=1&uploadError=${encodeURIComponent(err)}`);
          return;
        }
      }
      router.push(`/transactions/${res.id}?saved=1`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {state.error && <Alert>{state.error}</Alert>}

      {/* Type */}
      <fieldset>
        <legend className="label">Type</legend>
        <div className="grid grid-cols-2 gap-2">
          {(["out", "in"] as const).map((t) => (
            <label
              key={t}
              className={`flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-lg border text-sm font-semibold ${
                type === t
                  ? t === "in"
                    ? "border-in bg-teal-50 text-in-text ring-2 ring-in/30"
                    : "border-out bg-orange-50 text-out-text ring-2 ring-out/30"
                  : "border-border bg-white text-slate-600"
              }`}
            >
              <input type="radio" name="type" value={t} checked={type === t} onChange={() => setType(t)} className="sr-only" />
              <span aria-hidden>{t === "in" ? "↓" : "↑"}</span>
              {t === "in" ? "Money In" : "Money Out"}
            </label>
          ))}
        </div>
        <FieldError message={fe.type} />
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="amount" className="label">Amount (PKR)</label>
          <input
            id="amount"
            name="amount"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0"
            defaultValue={defaults.amount}
            required
            className="input tabular text-lg font-semibold"
            aria-invalid={Boolean(fe.amount)}
          />
          <FieldError message={fe.amount} />
        </div>
        <div>
          <label htmlFor="txn_date" className="label">Date</label>
          <input id="txn_date" name="txn_date" type="date" defaultValue={defaults.txn_date} required className="input" />
          <FieldError message={fe.txn_date} />
        </div>
      </div>

      <div>
        <label htmlFor="description" className="label">Purpose / description</label>
        <input
          id="description"
          name="description"
          defaultValue={defaults.description}
          required
          maxLength={1000}
          placeholder={type === "in" ? "e.g. Funds for plumber labour" : "e.g. Cement 2 bori"}
          className="input"
        />
        <FieldError message={fe.description} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="category_id" className="label">Category</label>
          <select id="category_id" name="category_id" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="input">
            <option value="">Uncategorised</option>
            {visibleCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {!c.is_active ? " (inactive)" : ""}
              </option>
            ))}
          </select>
          <FieldError message={fe.category_id} />
        </div>
        <fieldset>
          <legend className="label">Payment method</legend>
          <div className="flex flex-wrap gap-2">
            {[{ value: "", label: "—" }, ...PAYMENT_METHODS].map((m) => (
              <label
                key={m.value || "none"}
                className={`flex min-h-11 cursor-pointer items-center rounded-lg border px-3 text-sm font-medium ${
                  method === m.value ? "border-brand bg-brand-soft text-brand" : "border-border bg-white text-slate-600"
                }`}
              >
                <input type="radio" name="payment_method" value={m.value} checked={method === m.value} onChange={() => setMethod(m.value)} className="sr-only" />
                {m.label}
              </label>
            ))}
          </div>
          {(method === "mixed" || method === "other" || defaults.payment_method_detail) && (
            <input
              name="payment_method_detail"
              defaultValue={defaults.payment_method_detail}
              placeholder="Details, e.g. 20k cash + 30k bank"
              maxLength={200}
              className="input mt-2"
            />
          )}
        </fieldset>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <PersonPicker id="paid_by_id" label="Paid by" value={paidBy} onChange={setPaidBy} people={people} newName="new_paid_by" error={fe.paid_by_id ?? fe.new_paid_by} />
        <PersonPicker id="paid_to_id" label="Paid to" value={paidTo} onChange={setPaidTo} people={people} newName="new_paid_to" error={fe.paid_to_id ?? fe.new_paid_to} />
      </div>

      <div>
        <label htmlFor="notes" className="label">Notes <span className="font-normal text-muted">(optional)</span></label>
        <textarea id="notes" name="notes" rows={2} maxLength={2000} defaultValue={defaults.notes} className="input" />
      </div>

      <div>
        <span className="label">{mode === "create" ? "Receipts" : "Add more receipts"} <span className="font-normal text-muted">(photos or PDF, up to {MAX_RECEIPTS_PER_UPLOAD})</span></span>
        <label className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white px-3 text-sm font-medium text-brand hover:bg-brand-soft">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
            <path d="M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 100-8 4 4 0 000 8z" />
          </svg>
          Take photo or choose file
          <input
            ref={fileInput}
            type="file"
            name="receipts"
            accept="image/*,application/pdf"
            multiple
            className="sr-only"
            onChange={(e) => onFiles(e.target.files)}
          />
        </label>
        {files.length > 0 && (
          <ul className="mt-2 space-y-1">
            {files.map((f, i) => (
              <li key={i} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                <span className="truncate">{f.name}</span>
                <button type="button" className="ml-2 shrink-0 text-red-600" onClick={() => setFiles(files.filter((_, j) => j !== i))} aria-label={`Remove ${f.name}`}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="sticky bottom-20 z-10 -mx-4 flex gap-2 border-t border-border bg-white/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 lg:bottom-0">
        <button type="submit" className="btn-primary flex-1 sm:flex-none" disabled={pending}>
          {pending ? status ?? "Saving…" : mode === "create" ? "Save transaction" : "Save changes"}
        </button>
        <a href={cancelHref} className="btn-secondary">Cancel</a>
      </div>
    </form>
  );
}

function PersonPicker({
  id,
  label,
  value,
  onChange,
  people,
  newName,
  error,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  people: Person[];
  newName: string;
  error?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      <select id={id} name={id} value={value} onChange={(e) => onChange(e.target.value)} className="input">
        <option value="">— Not specified —</option>
        {people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
            {!p.is_active ? " (inactive)" : ""}
          </option>
        ))}
        <option value={NEW}>+ Add new person…</option>
      </select>
      {value === NEW && <input name={newName} placeholder="Name of new person / shop" maxLength={120} required autoFocus className="input mt-2" />}
      <FieldError message={error} />
    </div>
  );
}
