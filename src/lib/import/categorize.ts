// Deterministic, keyword-based category suggestion for historical rows.
// The spreadsheet has no category column, so every category assigned here is
// stored with category_inferred = true and can be corrected in the app.
// Rows that match no rule are left uncategorised (never guessed).

import type { TxnType } from "../money";

type Rule = { category: string; desc?: RegExp; payee?: RegExp };

const IN_RULES: Rule[] = [
  { category: "Refunds & Returns", desc: /\breturn/i },
  { category: "Rent Income", desc: /\brent (received|income)\b/i },
];

const OUT_RULES: Rule[] = [
  { category: "Furnishing & Fittings", desc: /\btea ?spoon/i },
  {
    category: "Food & Refreshments",
    desc: /\b(khana|chaye|chaiye|chai|tea|lunch|dinner|bottle|dahi|chaat|bhallay|tikk?ah?|refreshments?)\b/i,
  },
  { category: "Transport & Fuel", desc: /\b(petrol|diesel|fuel|rickshaw|transport|fare)\b/i },
  { category: "Floor Chips", desc: /\bchips\b/i },
  { category: "Labour", payee: /^(mistri|mazdoor|labou?r|floor labou?r)$/i },
  {
    category: "Tools & Equipment Rental",
    desc: /\b(ghora pori|rental|toolkit|tools?|drill|aari|blade|hammer|machine)\b/i,
  },
  { category: "Ceiling", desc: /\bceiling\b/i, payee: /uniq interior/i },
  {
    category: "Furnishing & Fittings",
    desc: /\b(carpet|curtains?|locks?|office indoor|basket|lota)\b/i,
  },
  {
    category: "Electrical",
    desc: /\b(electric\w*|wire|sub-?meter|lights?|switch\w*)\b/i,
    payee: /electric/i,
  },
  {
    category: "Paint & Colour",
    desc: /\b(white cement|distamber|paint\w*|filling|brush\w*|rang ?saaz)\b/i,
    payee: /\b(paint|rang ?saaz)\b/i,
  },
  {
    category: "Construction Materials",
    desc: /\b(cement|bori|building materials?|marble|tiles?)\b/i,
    payee: /\b(marble|tiles?)\b/i,
  },
  { category: "Paint & Colour", desc: /\bcolou?r\b/i },
  {
    category: "Plumbing & Sanitary",
    desc: /\b(santri|santary|santry|sanitary|plumb\w*|pipe|shower|p-traps?|sink|motor|seat cover|wash ?room)\b/i,
    payee: /\b(santri|santary|santry|plumber|motor|combot)\b/i,
  },
  { category: "Labour", desc: /\b(labou?r|mistri|mazdoor|mzdoor)\b/i },
  { category: "Other", desc: /\b(pest control|deemak)\b/i },
];

export function suggestCategory(
  type: TxnType,
  description: string | null,
  paidTo: string | null,
): string | null {
  const desc = description ?? "";
  const payee = (paidTo ?? "").trim();

  if (type === "in") {
    for (const r of IN_RULES) if (r.desc?.test(desc)) return r.category;
    // Every other incoming row in the ledger is money provided for the project.
    return desc || payee ? "Funds Received" : null;
  }

  for (const r of OUT_RULES) {
    if ((r.desc && r.desc.test(desc)) || (r.payee && payee && r.payee.test(payee))) {
      return r.category;
    }
  }
  return null;
}
