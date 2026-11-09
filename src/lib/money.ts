// Exact money handling. All arithmetic is done on integer paisa ("cents") so no
// floating-point rounding can creep in. Database values arrive as numeric
// strings (e.g. "1234.50") and are parsed with string operations only.

export type TxnType = "in" | "out";

const AMOUNT_RE = /^([+-])?(\d+)(?:\.(\d{1,2}))?$/;

/**
 * Parse a user / spreadsheet / database amount into signed integer cents.
 * Accepts "1,234.5", "-3500", "PKR 296,500", "Rs. 12", " 25000 ".
 * Returns null for anything that is not an unambiguous amount
 * (e.g. more than 2 decimals, letters, empty).
 */
export function parseAmountToCents(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  let s = String(input).trim();
  if (!s) return null;
  s = s.replace(/^(pkr|rs\.?)\s*/i, "");
  // Allow "- 3500" and "PKR -3500"
  s = s.replace(/^([+-])\s+/, "$1");
  // Thousands separators: only accept well-formed groups.
  if (s.includes(",")) {
    if (!/^[+-]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) return null;
    s = s.replace(/,/g, "");
  }
  const m = AMOUNT_RE.exec(s);
  if (!m) return null;
  const [, sign, whole, frac = ""] = m;
  if (whole.length > 13) return null; // beyond numeric(14,2)
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) return null;
  return sign === "-" ? -cents : cents;
}

/** Strict positive amount for forms: returns cents > 0 or null. */
export function parsePositiveAmount(input: string | null | undefined): number | null {
  const c = parseAmountToCents(input);
  return c !== null && c > 0 ? c : null;
}

/** Cents → "1234.50" (for sending to PostgreSQL numeric). */
export function centsToDecimal(cents: number): string {
  if (!Number.isSafeInteger(cents)) throw new Error("Invalid cents value");
  const neg = cents < 0;
  const abs = Math.abs(cents);
  const s = `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
  return neg ? `-${s}` : s;
}

/** Database numeric string → cents. Throws on malformed input (it should never happen). */
export function dbToCents(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0;
  const c = parseAmountToCents(String(value));
  if (c === null) throw new Error(`Malformed amount from database: ${value}`);
  return c;
}

export function signedCents(type: TxnType, amountCents: number): number {
  return type === "in" ? amountCents : -amountCents;
}

export function sumCents(values: number[]): number {
  let total = 0;
  for (const v of values) {
    total += v;
    if (!Number.isSafeInteger(total)) throw new Error("Amount overflow");
  }
  return total;
}

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * Format cents for display: "PKR 1,234" or "PKR 1,234.50".
 * `sign: "always"` prefixes "+" for positive values.
 */
export function formatMoney(
  cents: number,
  opts: { sign?: "auto" | "always" | "never"; currency?: boolean } = {},
): string {
  const { sign = "auto", currency = true } = opts;
  const abs = Math.abs(cents);
  const whole = groupThousands(String(Math.floor(abs / 100)));
  const frac = abs % 100;
  const num = frac ? `${whole}.${String(frac).padStart(2, "0")}` : whole;
  let prefix = "";
  if (cents < 0 && sign !== "never") prefix = "-";
  else if (cents > 0 && sign === "always") prefix = "+";
  return `${prefix}${currency ? "PKR " : ""}${num}`;
}

/** Compact form for chart labels: 296.5k, 1.2M */
export function formatCompact(cents: number): string {
  const v = Math.abs(cents) / 100;
  const sign = cents < 0 ? "-" : "";
  if (v >= 1_000_000) return `${sign}${(Math.round(v / 100_000) / 10).toString()}M`;
  if (v >= 1_000) return `${sign}${(Math.round(v / 100) / 10).toString()}k`;
  return `${sign}${Math.round(v)}`;
}
