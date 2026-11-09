"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui";
import { uploadReceipts } from "@/lib/receipt-upload";
import { MAX_RECEIPTS_PER_UPLOAD } from "@/lib/validation";
import { deleteAttachment, deleteTransaction } from "../actions";

export function DeleteTransactionButton({ id, label }: { id: string; label: string }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!confirming) {
    return (
      <button type="button" className="btn-secondary text-red-600" onClick={() => setConfirming(true)}>
        Delete
      </button>
    );
  }
  return (
    <div className="w-full rounded-lg border border-red-200 bg-red-50 p-3 sm:w-auto">
      <p className="text-sm text-red-800">Delete {label} and its receipts permanently? This cannot be undone.</p>
      {error && <p className="mt-1 text-sm text-red-700">{error}</p>}
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          className="btn-danger"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await deleteTransaction(id);
              if (res?.error) setError(res.error);
            })
          }
        >
          {pending ? "Deleting…" : "Yes, delete"}
        </button>
        <button type="button" className="btn-secondary" onClick={() => setConfirming(false)} disabled={pending}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export function AddReceipts({ transactionId }: { transactionId: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div>
      {error && <div className="mb-2"><Alert>{error}</Alert></div>}
      <label className={`btn-secondary w-full cursor-pointer sm:w-auto ${pending ? "pointer-events-none opacity-60" : ""}`}>
        {pending ? "Uploading…" : "+ Add receipt (photo / PDF)"}
        <input
          ref={input}
          type="file"
          accept="image/*,application/pdf"
          multiple
          className="sr-only"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []).slice(0, MAX_RECEIPTS_PER_UPLOAD);
            if (!files.length) return;
            start(async () => {
              setError(null);
              const err = await uploadReceipts(transactionId, files);
              if (err) setError(err);
              if (input.current) input.current.value = "";
              router.refresh();
            });
          }}
        />
      </label>
    </div>
  );
}

export function RemoveReceiptButton({ id }: { id: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (!confirm)
    return (
      <button type="button" className="text-xs font-medium text-red-600 hover:underline" onClick={() => setConfirm(true)}>
        Remove
      </button>
    );
  return (
    <span className="flex items-center gap-2 text-xs">
      {error && <span className="text-red-700">{error}</span>}
      <button
        type="button"
        className="font-semibold text-red-700"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await deleteAttachment(id);
            if (res.error) setError(res.error);
            else router.refresh();
          })
        }
      >
        {pending ? "Removing…" : "Confirm remove"}
      </button>
      <button type="button" className="text-slate-600" onClick={() => setConfirm(false)}>Cancel</button>
    </span>
  );
}
