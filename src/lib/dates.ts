// Calendar dates are handled as "YYYY-MM-DD" strings in the project's local
// timezone (Pakistan) so "today" is correct regardless of the server's timezone.

export const APP_TIMEZONE = process.env.NEXT_PUBLIC_APP_TIMEZONE || "Asia/Karachi";

export function todayISO(now: Date = new Date(), timeZone = APP_TIMEZONE): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function isISODate(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function toDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const d = toDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return fromDate(d);
}

/** Monday-based week start (matches PostgreSQL date_trunc('week')). */
export function startOfWeek(iso: string): string {
  const d = toDate(iso);
  const dow = (d.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  return addDays(iso, -dow);
}

export function startOfMonth(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

export function endOfMonth(iso: string): string {
  const d = toDate(startOfMonth(iso));
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return fromDate(d);
}

export type PeriodKind = "day" | "week" | "month" | "custom" | "all";

export interface Period {
  kind: PeriodKind;
  from: string | null;
  to: string | null;
  label: string;
}

/**
 * Resolve a report period from query params.
 *  period=day|week|month (anchored on `date`, default today), or custom from/to, or all.
 */
export function resolvePeriod(
  params: { period?: string; date?: string; from?: string; to?: string },
  today = todayISO(),
): Period {
  const anchor = isISODate(params.date) ? params.date : today;
  switch (params.period) {
    case "day":
      return { kind: "day", from: anchor, to: anchor, label: formatDate(anchor) };
    case "week": {
      const from = startOfWeek(anchor);
      const to = addDays(from, 6);
      return { kind: "week", from, to, label: `Week of ${formatDate(from)}` };
    }
    case "month": {
      const from = startOfMonth(anchor);
      return { kind: "month", from, to: endOfMonth(anchor), label: formatMonth(from) };
    }
    case "custom": {
      let from = isISODate(params.from) ? params.from : null;
      let to = isISODate(params.to) ? params.to : null;
      if (from && to && from > to) [from, to] = [to, from];
      const label =
        from && to ? `${formatDate(from)} – ${formatDate(to)}` : from ? `From ${formatDate(from)}` : to ? `Until ${formatDate(to)}` : "All time";
      return { kind: "custom", from, to, label };
    }
    default:
      return { kind: "all", from: null, to: null, label: "All time" };
  }
}

/** Shift a day/week/month period backwards or forwards. Returns the new anchor date. */
export function shiftAnchor(kind: PeriodKind, anchor: string, dir: -1 | 1): string {
  if (kind === "day") return addDays(anchor, dir);
  if (kind === "week") return addDays(anchor, 7 * dir);
  if (kind === "month") {
    const d = toDate(startOfMonth(anchor));
    d.setUTCMonth(d.getUTCMonth() + dir);
    return fromDate(d);
  }
  return anchor;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export function formatMonth(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

export function formatDateTime(ts: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: APP_TIMEZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ts));
}
