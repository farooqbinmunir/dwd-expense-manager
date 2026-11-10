# Playbook: Google Sheet → private web app

How the DWD Expense Manager was built, written so that the next project can reuse it. The next
project is a **personal budget app** that replaces the owner's personal budget Google Sheet.

Use this repository (`dwd-expense-manager`) as the **reference codebase**. Read the code before
writing new code. Most of it carries over with small changes.

---

## 1. Workflow

1. **Get the sheet.** The owner publishes the Google Sheet ("Publish to web") and shares the
   `pubhtml` link. Only ever read it, never modify it.
2. **Download every tab**, each in two formats:
   - CSV for values: `…/pub?gid=<GID>&single=true&output=csv`
   - The whole workbook as `.xlsx` (`…/pub?output=xlsx`) for merged cells and embedded images.
3. **Analyse before designing.** Find the real columns, sign conventions, date formats, blank or
   merged cells, totals rows and summary tabs. Base the data model on what the sheet actually
   contains, and invent nothing. Write down your assumptions.
4. **Design the schema.** Write the SQL migrations with Row Level Security from day one.
5. **Build the importer first**, with `--dry-run`. The import must reconcile exactly against the
   sheet's own totals before anything is written to the database.
6. **Build the UI:** dashboard, transactions CRUD, reports and settings.
7. **Test:**
   - Unit tests: money, parser, validation, dates.
   - Integration tests: RLS, run against local Supabase in Docker.
8. **Deploy:** Supabase project → `db push` → `config push` → Vercel → import → create the user.

## 2. Stack (exact versions in `package.json`)

- **Framework:** Next.js 16.4.5 (App Router, Server Actions), React 19.3, TypeScript.
- **Styling:** Tailwind 4 (`@tailwindcss/turbopack`).
- **Backend:** Supabase (Postgres, Auth, private Storage, RLS), using `@supabase/ssr` and
  `@supabase/supabase-js`.
- **Validation:** zod 4.
- **Tooling:** vitest 5 for tests, tsx for scripts, fflate for unzipping the xlsx (no heavy xlsx
  library).
- **Hosting:** Vercel.

## 3. What to reuse, and how much it changes

| Area | Files | For a personal budget |
|---|---|---|
| Supabase clients | `src/lib/supabase/{server,browser,admin}.ts`, `src/lib/env.ts` | Copy as is |
| Session / auth guard | `src/proxy.ts`, `src/lib/auth.ts`, `src/app/login/*`, `src/app/auth-actions.ts` | Copy. With a single user, roles can be dropped, but keep `is_active_user()`-style RLS |
| Money (integer paisa, no floats) | `src/lib/money.ts`, `tests/money.test.ts` | Copy as is |
| Dates / report periods (Asia/Karachi) | `src/lib/dates.ts` | Copy as is |
| CSV export | `src/lib/csv.ts`, `src/app/api/export/route.ts` | Copy, then change the columns |
| UI kit, nav, charts | `src/components/{ui,nav,charts}.tsx`, `src/app/globals.css` | Copy, then restyle |
| Dashboard | `src/app/(app)/page.tsx` | Same idea with new cards: income, expenses, savings, budget vs actual |
| Transactions CRUD + filters | `src/app/(app)/transactions/*`, `src/lib/validation.ts`, `src/lib/queries.ts` | Adapt. Fields become account, category and optional tags; people are likely not needed |
| Categories | `src/app/(app)/categories/*` | Adapt. Add a **monthly budget per category** |
| Reports | `src/app/(app)/reports/page.tsx` + SQL `report_*` functions | Adapt: month-over-month, category trends, budget vs actual |
| Receipts | `src/lib/receipt-upload.ts`, `transactions/[id]/client-parts.tsx` | Optional. Copy only if the sheet has images |
| Importer | `scripts/import-sheet.ts`, `src/lib/import/*` | Reuse the structure: download, parse, expand merges, reconcile, atomic RPC, report. The parser is rewritten for the new sheet's layout |
| Users admin | `src/app/(app)/admin/users/*`, `scripts/create-admin.ts` | Probably only `create-admin` (single user) |
| Migrations | `supabase/migrations/*` | Same pattern: schema + RLS, seed categories, **grants** |

Likely additions for a budget app (confirm them with the sheet first):

- Accounts or wallets (cash, bank, JazzCash) with balances and transfers between them.
- Monthly budgets per category, with the amount remaining.
- Recurring items (salary, rent, bills).
- Savings goals.

## 4. Principles that worked

- **Money:**
  - Store as `numeric(14,2)`, always positive, with a `type` column (`in`/`out`) that sets the sign.
  - Sum in SQL and return the total as text.
  - In JS, convert to integer paisa. Never use floats.
- **Security is in the database, not the UI:**
  - RLS on every table.
  - SECURITY DEFINER helper functions (`is_active_user()`, `is_admin()`).
  - A private storage bucket, with policies keyed on a `<txnId>/` folder.
  - The anon role gets nothing.
  - Provenance columns (`source`, `source_ref`, `created_by`) are immutable, enforced by a trigger.
- **Import:**
  - Idempotent: each row is keyed by `source_ref` (`gsheet:TAB!R31`) plus a content hash. Re-runs
    skip unchanged rows and report changed ones instead of overwriting them.
  - Atomic: one RPC, executable by `service_role` only.
  - Reconciled against the sheet's own totals before and after writing.
  - Writes a Markdown and JSON report plus a snapshot to the git-ignored `import-reports/`.
- **No invented data.** Leave blanks blank, flag them in the report, and mark auto-suggested
  categories as "auto".
- **Large uploads:** go directly from the browser to Storage (Vercel limits request bodies to
  4.5 MB). A server action then verifies and registers the file.
- **Next 16 forms:** use Server Actions with zod validation, and return field errors.

## 5. Gotchas we hit (and fixes)

**Next.js / Tailwind**

- Next 16 renamed **middleware to `proxy.ts`**. `params`/`searchParams` are async, and the global
  `PageProps`/`LayoutProps` types exist. Read `node_modules/next/dist/docs/` before coding.
- `cacheComponents` and `partialPrefetching` were left **off**: they complicate auth-dependent
  pages.
- Tailwind 4: a custom class that you want to `@apply` must be declared with **`@utility`**. A
  plain class gives "Cannot apply unknown utility class".
- ESLint `react-hooks/set-state-in-effect`: for "remember last entry" style state, use
  `useSyncExternalStore` with localStorage.

**Importing the sheet**

- **Merged cells** make rows look blank in the CSV. Read the merges from the xlsx
  (`xl/worksheets/sheetN.xml`) and expand them.
- **Images** in the sheet live in the xlsx drawings. Map each image's anchor to a row; see
  `xlsx-images.ts`.
- Make keyword categorisation rules strict, for example `/\brent (received|income)\b/i` rather
  than `/rent/`.

**npm**

- An `@types/node` peer conflict with vitest was fixed by installing `@types/node@^24`.

**Supabase (hosted)**

- New hosted projects **do not grant table privileges** to the API roles. Without the explicit
  grants migration (`20261110000003_grants.sql`) you get "permission denied for table …".
- `supabase projects api-keys` shows the **secret key masked**; use `--reveal`. A masked key gives
  "Invalid API key".
- Before `supabase config push`, align `config.toml` with the hosted defaults. Otherwise the push
  silently weakens settings such as email confirmations, OTP length and MFA. The push needs
  `--yes`; get the owner's consent first. It also sets `enable_signup = false`, `site_url` and the
  redirect URLs.
- Check auth settings with `GET https://<ref>.supabase.co/auth/v1/settings` and look at
  `disable_signup`.

**Vercel**

- The Vercel CLI can hang on telemetry or prompts. Use `--non-interactive` (for example
  `vercel whoami --non-interactive`).
- Mark `SUPABASE_SERVICE_ROLE_KEY` as `--sensitive` in Vercel. Never prefix it with `NEXT_PUBLIC_`.

**Machine and git**

- `!` is a prefix only inside the Claude Code prompt. In PowerShell, run `npx supabase login`
  directly.
- **Git push:** the machine's default GitHub identity (rsgFarooq) is not authorised. Set the remote
  to the SSH alias `git@github.com-rextech:farooqbinmunir/<repo>.git`; the alias is defined in
  `~/.ssh/config`.
- Network blips during the receipt upload are harmless, because the import is idempotent. Just run
  it again.

## 6. Deploy checklist (Windows / PowerShell)

1. Create the Supabase project. Put `SUPABASE_DB_PASSWORD` in `.env.local`.
2. Link the project and apply the migrations:
   ```powershell
   npx supabase link --project-ref <ref>
   npx supabase db push
   ```
3. Align `config.toml` with the hosted defaults, then:
   ```powershell
   npx supabase config push --remote=<ref> --yes
   ```
4. Create `.env.prod` (git-ignored) with the URL, the publishable key and the secret key (from
   `api-keys --reveal`).
5. Link Vercel, add the three env vars (Production + Preview) and deploy:
   ```powershell
   vercel link
   vercel env add …
   vercel --prod
   ```
6. Import, then create the user, both with the `.env.prod` values loaded:
   ```powershell
   npm run import:sheet -- --dry-run
   npm run import:sheet
   npm run create-admin -- <email> "<name>"
   ```
7. Smoke test:
   - `/login` returns 200, `/` redirects to `/login`, and `/api/export` returns 401 when signed out.
   - The anon REST API is refused.
   - A real login works, and the dashboard totals match the sheet.

## 7. Kick-off prompt for the next session

> Read `..\dwd-expense-manager\PLAYBOOK.md` and use `..\dwd-expense-manager` as the reference
> codebase. Build a private personal budget app that replaces my Google Sheet: <pubhtml link>.
> First analyse every tab of the sheet and propose the data model and features (dashboard,
> entry, reports, budgets) before building. Same stack, same import/reconcile approach, Windows
> commands.
