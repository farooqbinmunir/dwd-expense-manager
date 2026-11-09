import Link from "next/link";
import type { ReactNode } from "react";
import { formatMoney } from "@/lib/money";

export function PageHeader({
  title,
  description,
  actions,
  back,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {back && (
          <Link href={back.href} className="mb-1 inline-flex items-center gap-1 text-sm text-muted hover:text-brand">
            <span aria-hidden>←</span> {back.label}
          </Link>
        )}
        <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className = "" }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          {title && <h2 className="text-sm font-semibold text-slate-800">{title}</h2>}
          {actions}
        </div>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Amount({ type, cents, className = "" }: { type: "in" | "out"; cents: number; className?: string }) {
  return (
    <span className={`tabular font-semibold whitespace-nowrap ${type === "in" ? "text-in-text" : "text-out-text"} ${className}`}>
      {type === "in" ? "+" : "−"}
      {formatMoney(cents, { sign: "never" })}
    </span>
  );
}

export function TypeBadge({ type }: { type: "in" | "out" }) {
  return type === "in" ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2 py-0.5 text-xs font-medium text-in-text ring-1 ring-teal-600/20">
      <span aria-hidden>↓</span> Money In
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2 py-0.5 text-xs font-medium text-out-text ring-1 ring-orange-600/20">
      <span aria-hidden>↑</span> Money Out
    </span>
  );
}

export function Badge({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "blue" | "amber" | "red" | "green" }) {
  const tones = {
    slate: "bg-slate-100 text-slate-700 ring-slate-500/20",
    blue: "bg-blue-50 text-blue-800 ring-blue-600/20",
    amber: "bg-amber-50 text-amber-800 ring-amber-600/20",
    red: "bg-red-50 text-red-700 ring-red-600/20",
    green: "bg-green-50 text-green-800 ring-green-600/20",
  };
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${tones[tone]}`}>{children}</span>;
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
      <p className="font-medium text-slate-800">{title}</p>
      {children && <p className="mt-1 max-w-sm text-sm text-muted">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Alert({ tone = "error", children }: { tone?: "error" | "success" | "info" | "warning"; children: ReactNode }) {
  const tones = {
    error: "border-red-200 bg-red-50 text-red-800",
    success: "border-green-200 bg-green-50 text-green-800",
    info: "border-blue-200 bg-blue-50 text-blue-800",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
  };
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-lg border px-3 py-2 text-sm ${tones[tone]}`}>
      {children}
    </div>
  );
}

export function StatTile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "in" | "out" | "brand" }) {
  const accent = tone === "in" ? "bg-in" : tone === "out" ? "bg-out" : tone === "brand" ? "bg-brand" : "bg-slate-300";
  return (
    <div className="card relative overflow-hidden p-4">
      <span className={`absolute inset-y-0 left-0 w-1 ${accent}`} aria-hidden />
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="tabular mt-1 text-xl font-semibold text-foreground sm:text-2xl">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </div>
  );
}

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-sm text-red-600">{message}</p>;
}
