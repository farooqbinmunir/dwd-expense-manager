# DWD Construction Expense Manager

Private, mobile-friendly ledger for the DWD office construction project. It replaces the
"DWD - Office Construction Expenses" Google Sheet. The historical rows and their receipt photos
are imported once, and team members then record every payment in the app.

**Stack:** Next.js 16 (App Router, Server Actions) · TypeScript · Tailwind CSS 4 · Supabase
(PostgreSQL, Auth, private Storage, Row Level Security) · Vercel.

---

## Features

- **Dashboard:** money received, money spent, remaining balance, transaction count, recent
  transactions, an income-vs-expense chart, expenses by category and a monthly overview. Every
  figure is computed in the database from real records.
- **Transactions:** add, edit, view and delete (admins only, with confirmation). You can search by
  description, person, category, amount or TXN number. You can filter by date range, type,
  category, payment method and person, and sort by date or amount. The list shows a running balance
  and paginates.
- **Receipts:** attach several photos or PDFs to a transaction. Files go straight from the phone to a
  **private** Supabase bucket, and large photos are downscaled in the browser first. Images show
  previews and can be opened or downloaded through short-lived signed URLs.
- **People:** add, edit, deactivate and view people, with per-person totals. A new payee can also be
  added on the fly while recording a transaction.
- **Categories:** admins can edit them. The starting set comes from the spreadsheet's actual entries.
- **Reports:** daily, weekly, monthly, custom range and all time. Each report shows an income and
  expense breakdown, category-wise totals and person-wise payments, and can be exported to CSV
  (transactions, or a summary).
- **Users and roles:** email/password sign-in, with *admin* and *member* roles. Admins create
  accounts, change roles, activate or deactivate users and reset passwords.

### Permissions

| Action | Member | Admin |
|---|---|---|
| View dashboard, transactions, receipts and reports | ✅ | ✅ |
| Add transactions and receipts | ✅ | ✅ |
| Edit a transaction and its receipts | own entries only | all |
| Delete transactions | ❌ | ✅ |
| Add people | ✅ | ✅ |
| Edit or deactivate people | ❌ | ✅ |
| Manage categories | ❌ | ✅ |
| Manage users | ❌ | ✅ |

These rules are enforced by **PostgreSQL Row Level Security and storage policies**, not just
hidden in the UI. Other protections:

- Anonymous visitors can read nothing.
- New or deactivated accounts can see nothing until an admin activates them.
- Provenance fields (`created_by`, `source`, `source_ref`) cannot be changed by anyone.
- The last active admin can never be demoted or deactivated.

### Money handling

- Amounts are stored as `numeric(14,2)` and are always positive. The type sets the sign: Money In
  is `+`, Money Out is `−`.
- All totals are summed in PostgreSQL and returned as decimal **strings**.
- The app converts amounts to integer paisa for display and CSV, so floating-point arithmetic is
  never used.

---

## Project layout

```
supabase/migrations/   SQL: schema, constraints, indexes, RLS, storage policies, report functions,
                       import RPC (…_schema.sql) and initial categories (…_seed_categories.sql)
scripts/import-sheet.ts   historical import + reconciliation (idempotent)
scripts/create-admin.ts   bootstrap the first admin
src/proxy.ts           session refresh + redirect to /login (Next 16 "proxy" = middleware)
src/lib/               money, csv, dates, validation, queries, auth, supabase clients
src/lib/import/        ledger parser, merged-cell handling, xlsx image extraction, categoriser
src/app/(app)/         dashboard, transactions, people, categories, reports, admin/users, account
src/app/api/export/    CSV export
tests/                 unit tests (vitest) + tests/integration (RLS, against local Supabase)
docs/import-report.md  reconciliation report of the historical import
docs/csv-import-template.csv   template for the CSV fallback import
```

---

## Environment variables

Copy `.env.example` to `.env.local` and fill in the values. Set the same names in Vercel.

| Name | Where | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | browser + server | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | browser + server | Publishable key (`sb_publishable_…`) or legacy **anon** key. Protected by RLS. (`NEXT_PUBLIC_SUPABASE_ANON_KEY` is also accepted.) |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | Secret key (`sb_secret_…`) or legacy **service_role** key. Used for creating users and resetting passwords in the app, and by the import and create-admin scripts. Never prefix it with `NEXT_PUBLIC_` and never commit it. |
| `NEXT_PUBLIC_APP_TIMEZONE` | optional | Defaults to `Asia/Karachi`. Controls what "today" means and the report periods. |

---

## 1. Set up Supabase (production)

1. Create a project at <https://supabase.com/dashboard>. A region near Pakistan, such as
   *South Asia (Mumbai)*, works well. Save the database password.
2. **Apply the migrations.** Run these in PowerShell from the project folder:
   ```powershell
   npx supabase login
   npx supabase link --project-ref YOUR-PROJECT-REF
   npx supabase db push
   ```
   If you prefer not to use the CLI, open **SQL Editor** and run the two files in
   `supabase/migrations/` in order.
3. Set up **Authentication**:
   - **Authentication → Sign In / Providers → Email**: keep *Email* enabled.
   - **Authentication → Sign In / Providers**: turn **"Allow new users to sign up" OFF**. Only admins
     create accounts.
   - **Authentication → URL Configuration**: set *Site URL* to your Vercel URL, for example
     `https://dwd-expenses.vercel.app`.
4. Copy the keys from **Project Settings → API Keys**. You need the project URL, the publishable
   (anon) key and the secret (service_role) key. Put them in `.env.local`.
5. **Create the first admin** (you will be asked for a password):
   ```powershell
   npm install
   npm run create-admin -- you@example.com "Your Name"
   ```
6. Check that the `receipts` bucket exists and is **Private** under **Storage**. The migration
   creates it.

## 2. Import the historical spreadsheet

The import only **reads** the published spreadsheet; it never modifies it.

```powershell
npm run import:sheet -- --dry-run   # parse + reconcile only, writes a report, no DB writes
npm run import:sheet                # import into the Supabase project in .env.local
```

What the import does:

- **Sources.** It downloads the `INOUT` tab (CSV), the `Summary` tab, and the workbook as `.xlsx`.
  The xlsx is needed because it carries the receipt images and the merged-cell layout.
- **Amounts and dates.** A positive *In/Out* value means Money In; a negative one means Money Out.
  Merged cells (for example a date or description spanning several rows) are expanded, so each row
  gets its real value. A date that is genuinely blank inherits the date of the row above and is
  flagged.
- **Receipts.** The 79 embedded images are copied into the private bucket and attached to the
  transaction on the same row.
- **Traceability.** Each record keeps its sheet row (`gsheet:INOUT!R31`), a content hash and the
  original cell values. These are shown on the transaction page under *Original spreadsheet row*.
- **No invented data.** Missing descriptions, people and payment methods stay blank and are listed in
  the report.
- **Categories.** The sheet has no category column, so categories are *suggested* from each
  description by fixed keyword rules. They are marked "auto" so you can review them.
- **Atomic and idempotent.** All rows import in one database transaction or none do. Running the
  import again never duplicates anything:
  - A row that was already imported is skipped.
  - A row whose content changed in the sheet is reported, not overwritten.
  - A row moved to a different position is detected by its hash.
- **Reconciliation.** Totals are checked against the sheet's *Summary* tab and its "Remaining Total"
  row, both before and after writing to the database. A Markdown + JSON report and an exact snapshot
  of the downloaded files go to `import-reports/` (git-ignored, because it contains receipt photos).

**CSV fallback.** Use this if the published sheet is ever unavailable, or for extra rows from
another source. Use the same columns as the sheet (see `docs/csv-import-template.csv`). Dates can be
`M/D/YYYY` or `YYYY-MM-DD`, and amounts are signed.

```powershell
npm run import:sheet -- --csv path\to\file.csv --dry-run
npm run import:sheet -- --csv path\to\file.csv
```

## 3. Run locally

```powershell
npm install
npm run dev          # http://localhost:3000
```

To run against a **local** Supabase (needs Docker Desktop), use the demo keys printed by
`npx supabase start` in `.env.local`:

```powershell
npx supabase start   # applies the migrations automatically
npm run create-admin -- admin@example.com "Admin"
npm run import:sheet
```

## 4. Deploy to Vercel

1. Push the repository to GitHub (private repository recommended):
   ```powershell
   git add -A
   git commit -m "DWD expense manager"
   git remote add origin https://github.com/YOUR-USER/dwd-expense-manager.git
   git push -u origin main
   ```
2. At <https://vercel.com/new>, import the repository. The framework preset is detected as
   **Next.js**; leave the build settings at their defaults.
3. Under **Environment Variables**, add `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SERVICE_ROLE_KEY` for Production and
   Preview.
4. Click **Deploy**. Then set Supabase **Authentication → URL Configuration → Site URL** to the
   deployed URL.
5. Sign in with the admin account and add the other users under **Users**.

Alternatively, use the CLI: `npm i -g vercel`, then `vercel link`, `vercel env add …` and
`vercel --prod`.

## Adding users

As an admin, go to **Users → Add a user**. Enter a name, email, role and an initial password, then
share the password privately. The user can change it under **My account**. Users can be deactivated
at any time, and their data access stops immediately. Admins can also set a new password for a
user from the same page.

## Tests

```powershell
npm test                    # unit tests: money, CSV, ledger parser, merges, categoriser, validation, dates
npx supabase start          # then:
npm run test:integration    # RLS / auth / storage / triggers / reports / import RPC on LOCAL Supabase
npm run typecheck
npm run lint
```

The integration tests refuse to run against anything other than `localhost`.
