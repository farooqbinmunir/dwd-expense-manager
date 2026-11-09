import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, Amount, Badge, Card, PageHeader, TypeBadge } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { formatDate, formatDateTime } from "@/lib/dates";
import { dbToCents, formatMoney } from "@/lib/money";
import { getAttachments, getTransaction } from "@/lib/queries";
import { paymentMethodLabel, txnCode } from "@/lib/types";
import { AddReceipts, DeleteTransactionButton, RemoveReceiptButton } from "./client-parts";

export const metadata: Metadata = { title: "Transaction" };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-3 py-2.5 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="col-span-2 break-words text-slate-900">{children}</dd>
    </div>
  );
}

export default async function TransactionPage({ params, searchParams }: PageProps<"/transactions/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const [t, user] = await Promise.all([getTransaction(id), getCurrentUser()]);
  if (!t || !user) notFound();
  const attachments = await getAttachments(t.id);
  const isAdmin = user.role === "admin";
  const canEdit = isAdmin || t.created_by === user.id;
  const code = txnCode(t.txn_no);
  const raw = t.source_raw as Record<string, unknown> | null;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={t.description ?? "No description"}
        description={<span className="flex flex-wrap items-center gap-2"><span>{code}</span><TypeBadge type={t.type} /></span>}
        back={{ href: "/transactions", label: "Transactions" }}
        actions={
          <>
            {canEdit && <Link href={`/transactions/${t.id}/edit`} className="btn-primary">Edit</Link>}
            {isAdmin && <DeleteTransactionButton id={t.id} label={code} />}
          </>
        }
      />
      <div className="space-y-3">
        {sp.saved === "1" && <Alert tone="success">Transaction saved.</Alert>}
        {typeof sp.uploadError === "string" && <Alert>The transaction was saved, but a receipt failed to upload: {sp.uploadError}. You can add it again below.</Alert>}
      </div>

      <div className="mt-3 grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3" title="Details">
          <div className="mb-3 rounded-lg bg-slate-50 p-4 text-center">
            <Amount type={t.type} cents={dbToCents(t.amount)} className="text-3xl" />
            <p className="mt-1 text-xs text-muted">Balance after this entry: {formatMoney(dbToCents(t.running_balance))}</p>
          </div>
          <dl className="divide-y divide-border">
            <Row label="Date">
              {formatDate(t.txn_date)}
              {t.date_inferred && <span className="ml-2 text-xs text-muted">(date was blank in sheet – same day as row above)</span>}
            </Row>
            <Row label="Category">
              {t.category_name ?? <Badge>Uncategorised</Badge>}
              {t.category_inferred && <span className="ml-2 text-xs text-muted">(auto-assigned on import – please review)</span>}
            </Row>
            <Row label="Payment method">
              {paymentMethodLabel(t.payment_method)}
              {t.payment_method_detail && <span className="block text-xs text-muted">{t.payment_method_detail}</span>}
            </Row>
            <Row label="Paid by">{t.paid_by_name ?? "—"}</Row>
            <Row label="Paid to">{t.paid_to_name ?? "—"}</Row>
            <Row label="Notes">{t.notes ? <span className="whitespace-pre-wrap">{t.notes}</span> : "—"}</Row>
            <Row label="Created by">
              {t.source === "app" ? t.created_by_name || t.created_by_email || "—" : "Imported from spreadsheet"}
              <span className="block text-xs text-muted">{formatDateTime(t.created_at)}</span>
            </Row>
            {t.updated_by && <Row label="Last edited">{formatDateTime(t.updated_at)}</Row>}
          </dl>
          {!canEdit && <p className="mt-3 text-xs text-muted">Only an admin or the person who recorded this entry can edit it.</p>}
        </Card>

        <div className="space-y-4 lg:col-span-2">
          <Card title={`Receipts (${attachments.length})`}>
            {attachments.length === 0 && <p className="mb-3 text-sm text-muted">No receipts attached.</p>}
            <ul className="mb-3 grid grid-cols-2 gap-3">
              {attachments.map((a) => (
                <li key={a.id} className="overflow-hidden rounded-lg border border-border">
                  {a.url && a.mime_type?.startsWith("image/") ? (
                    <a href={a.url} target="_blank" rel="noopener noreferrer" className="block bg-slate-100">
                      {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from private storage */}
                      <img src={a.url} alt={a.file_name} className="aspect-[3/4] w-full object-cover" loading="lazy" />
                    </a>
                  ) : (
                    <a href={a.url ?? "#"} target="_blank" rel="noopener noreferrer" className="flex aspect-[3/4] items-center justify-center bg-slate-50 text-sm font-semibold text-brand">
                      {a.mime_type === "application/pdf" ? "PDF" : "File"}
                    </a>
                  )}
                  <div className="space-y-1 p-2">
                    <p className="truncate text-xs" title={a.file_name}>{a.file_name}</p>
                    <div className="flex items-center justify-between gap-2">
                      {a.downloadUrl ? <a href={a.downloadUrl} className="text-xs font-medium text-brand hover:underline">Download</a> : <span />}
                      {canEdit && <RemoveReceiptButton id={a.id} />}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            {canEdit && <AddReceipts transactionId={t.id} />}
          </Card>

          {t.source !== "app" && raw && (
            <Card title="Original spreadsheet row">
              <p className="mb-2 text-xs text-muted">
                {t.source_ref} {t.source_row ? `(row ${t.source_row})` : ""} — values exactly as they appeared in the sheet.
              </p>
              <dl className="text-xs">
                {(["date", "amount", "purpose", "payment_method", "paid_by", "paid_to", "note"] as const).map((k) => (
                  <div key={k} className="grid grid-cols-3 gap-2 py-1">
                    <dt className="text-muted">{k.replace("_", " ")}</dt>
                    <dd className="col-span-2 font-mono break-words">{String(raw[k] ?? "") || <span className="text-slate-400">(blank)</span>}</dd>
                  </div>
                ))}
                {raw.merged_from ? (
                  <div className="grid grid-cols-3 gap-2 py-1">
                    <dt className="text-muted">merged cells</dt>
                    <dd className="col-span-2 font-mono">
                      {Object.entries(raw.merged_from as Record<string, string>).map(([k, v]) => `${k}: ${v}`).join(", ")}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
