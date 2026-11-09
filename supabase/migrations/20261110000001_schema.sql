-- DWD Construction Expense Manager — core schema, security and reporting.
-- Money is stored as numeric(14,2) and is always a positive amount; the sign is
-- derived from the transaction type ('in' = +, 'out' = -).

-------------------------------------------------------------------------------
-- Profiles (one per auth user)
-------------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  full_name   text,
  role        text not null default 'member' check (role in ('admin', 'member')),
  -- New accounts are inactive until an admin activates them. This keeps the app
  -- closed even if public sign-ups are accidentally left enabled in Supabase.
  is_active   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Helper predicates used by RLS. SECURITY DEFINER so they can read profiles
-- without recursing into the profiles RLS policies.
create or replace function public.is_active_user()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.is_active
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_active and p.role = 'admin'
  );
$$;

-- Create a (inactive, member) profile for every new auth user.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Only admins may change role / activation / email of a profile, and the last
-- active admin can never be demoted or deactivated (prevents lock-out).
-- Requests made with the service role or directly in SQL have no auth.uid().
create or replace function public.protect_profile()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.role is distinct from old.role
       or new.is_active is distinct from old.is_active
       or new.email is distinct from old.email
       or new.id is distinct from old.id then
      raise exception 'Only an admin can change role, status or email'
        using errcode = '42501';
    end if;
  end if;

  if old.role = 'admin' and old.is_active
     and (new.role <> 'admin' or not new.is_active)
     and not exists (
       select 1 from public.profiles p
       where p.id <> old.id and p.role = 'admin' and p.is_active
     ) then
    raise exception 'At least one active admin is required'
      using errcode = '23514';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger protect_profile
  before update on public.profiles
  for each row execute function public.protect_profile();

-------------------------------------------------------------------------------
-- People (payers and payees: team members, vendors, labour, …)
-------------------------------------------------------------------------------
create table public.people (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(btrim(name)) between 1 and 120),
  kind        text check (kind in ('team', 'vendor', 'labour', 'other')),
  phone       text check (phone is null or length(phone) <= 40),
  notes       text check (notes is null or length(notes) <= 1000),
  is_active   boolean not null default true,
  created_by  uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
-- Case/space-insensitive uniqueness ("Farooq " == "farooq").
create unique index people_name_key
  on public.people (lower(regexp_replace(btrim(name), '\s+', ' ', 'g')));

-------------------------------------------------------------------------------
-- Categories
-------------------------------------------------------------------------------
create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(btrim(name)) between 1 and 80),
  applies_to  text not null default 'out' check (applies_to in ('in', 'out', 'both')),
  sort_order  integer not null default 100,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index categories_name_key on public.categories (lower(btrim(name)));

-------------------------------------------------------------------------------
-- Transactions
-------------------------------------------------------------------------------
create table public.transactions (
  id                    uuid primary key default gen_random_uuid(),
  -- Human-friendly sequential number shown as TXN-00001.
  txn_no                bigint generated always as identity unique,
  txn_date              date not null,
  type                  text not null check (type in ('in', 'out')),
  amount                numeric(14, 2) not null check (amount > 0),
  -- Required by the app; may be null only for historical rows whose source cell was blank.
  description           text check (description is null or length(description) <= 1000),
  category_id           uuid references public.categories (id) on delete set null,
  -- true when the category was auto-assigned from the description during import.
  category_inferred     boolean not null default false,
  payment_method        text check (payment_method in ('cash', 'online', 'card', 'mixed', 'other')),
  -- Free text, e.g. the original "20k cash + 30k bank".
  payment_method_detail text check (payment_method_detail is null or length(payment_method_detail) <= 200),
  paid_by_id            uuid references public.people (id) on delete restrict,
  paid_to_id            uuid references public.people (id) on delete restrict,
  notes                 text check (notes is null or length(notes) <= 2000),

  -- Provenance / traceability
  source                text not null default 'app' check (source in ('app', 'sheet_import', 'csv_import')),
  source_ref            text,       -- e.g. 'gsheet:INOUT!R31' – idempotency key
  source_row            integer,    -- original spreadsheet row number
  source_hash           text,       -- hash of the original row contents
  source_raw            jsonb,      -- the original cell values, verbatim
  date_inferred         boolean not null default false, -- date carried down from the row above

  created_by            uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at            timestamptz not null default now(),
  updated_by            uuid references public.profiles (id) on delete set null,
  updated_at            timestamptz not null default now(),

  constraint transactions_source_ref_key unique (source, source_ref),
  constraint transactions_import_has_ref check (source = 'app' or source_ref is not null)
);

create index transactions_date_idx      on public.transactions (txn_date desc, txn_no desc);
create index transactions_type_idx      on public.transactions (type);
create index transactions_category_idx  on public.transactions (category_id);
create index transactions_paid_by_idx   on public.transactions (paid_by_id);
create index transactions_paid_to_idx   on public.transactions (paid_to_id);
create index transactions_method_idx    on public.transactions (payment_method);
create index transactions_created_by_idx on public.transactions (created_by);

-- Keep audit columns honest and provenance immutable.
create or replace function public.transactions_before_update()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.id          := old.id;
  new.created_by  := old.created_by;
  new.created_at  := old.created_at;
  new.source      := old.source;
  new.source_ref  := old.source_ref;
  new.source_row  := old.source_row;
  new.source_hash := old.source_hash;
  new.source_raw  := old.source_raw;
  if new.category_id is distinct from old.category_id then
    new.category_inferred := false;
  end if;
  if new.txn_date is distinct from old.txn_date then
    new.date_inferred := false;
  end if;
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), old.updated_by);
  return new;
end;
$$;

create trigger transactions_before_update
  before update on public.transactions
  for each row execute function public.transactions_before_update();

-------------------------------------------------------------------------------
-- Receipt attachments
-------------------------------------------------------------------------------
create table public.attachments (
  id              uuid primary key default gen_random_uuid(),
  transaction_id  uuid not null references public.transactions (id) on delete cascade,
  storage_path    text unique,          -- object path inside the private 'receipts' bucket
  external_url    text,                 -- only for historical references that could not be copied
  file_name       text not null check (length(file_name) between 1 and 255),
  mime_type       text,
  size_bytes      bigint check (size_bytes is null or size_bytes >= 0),
  source_ref      text unique,          -- e.g. 'gsheet:INOUT!G31' – idempotency key for imports
  uploaded_by     uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at      timestamptz not null default now(),
  constraint attachments_has_target check (storage_path is not null or external_url is not null)
);
create index attachments_transaction_idx on public.attachments (transaction_id);

-------------------------------------------------------------------------------
-- updated_at helper for people / categories
-------------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = ''
as $$ begin new.updated_at := now(); return new; end; $$;

create trigger people_touch before update on public.people
  for each row execute function public.touch_updated_at();
create trigger categories_touch before update on public.categories
  for each row execute function public.touch_updated_at();

-------------------------------------------------------------------------------
-- Row Level Security
-------------------------------------------------------------------------------
alter table public.profiles     enable row level security;
alter table public.people       enable row level security;
alter table public.categories   enable row level security;
alter table public.transactions enable row level security;
alter table public.attachments  enable row level security;

-- Nothing is readable by anonymous visitors: every policy targets 'authenticated'
-- and additionally requires an *active* profile.

-- profiles
create policy "profiles: active users read"
  on public.profiles for select to authenticated
  using (public.is_active_user() or id = auth.uid());
create policy "profiles: self or admin update"
  on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());
-- inserts happen only via the auth trigger; deletes only via auth user deletion.

-- people
create policy "people: active users read"
  on public.people for select to authenticated using (public.is_active_user());
create policy "people: active users add"
  on public.people for insert to authenticated
  with check (public.is_active_user() and created_by = auth.uid());
create policy "people: admin update"
  on public.people for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "people: admin delete"
  on public.people for delete to authenticated using (public.is_admin());

-- categories
create policy "categories: active users read"
  on public.categories for select to authenticated using (public.is_active_user());
create policy "categories: admin insert"
  on public.categories for insert to authenticated with check (public.is_admin());
create policy "categories: admin update"
  on public.categories for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "categories: admin delete"
  on public.categories for delete to authenticated using (public.is_admin());

-- transactions: everyone active can read and add; members edit only their own;
-- admins edit everything; only admins delete.
create policy "transactions: active users read"
  on public.transactions for select to authenticated using (public.is_active_user());
create policy "transactions: active users add"
  on public.transactions for insert to authenticated
  with check (
    public.is_active_user()
    and created_by = auth.uid()
    and source = 'app'
    and source_ref is null
  );
create policy "transactions: owner or admin update"
  on public.transactions for update to authenticated
  using (public.is_admin() or (public.is_active_user() and created_by = auth.uid()))
  with check (public.is_admin() or (public.is_active_user() and created_by = auth.uid()));
create policy "transactions: admin delete"
  on public.transactions for delete to authenticated using (public.is_admin());

-- attachments: follow the parent transaction's edit rights.
create or replace function public.can_edit_transaction(p_transaction_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.is_admin() or exists (
    select 1 from public.transactions t
    where t.id = p_transaction_id
      and t.created_by = auth.uid()
      and public.is_active_user()
  );
$$;

create policy "attachments: active users read"
  on public.attachments for select to authenticated using (public.is_active_user());
create policy "attachments: editors add"
  on public.attachments for insert to authenticated
  with check (
    public.can_edit_transaction(transaction_id)
    and uploaded_by = auth.uid()
    and source_ref is null
    and storage_path is not null
  );
create policy "attachments: editors delete"
  on public.attachments for delete to authenticated
  using (public.can_edit_transaction(transaction_id));

-------------------------------------------------------------------------------
-- Private storage bucket for receipts
-------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'receipts', 'receipts', false, 10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif', 'application/pdf']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "receipts: active users read"
  on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and public.is_active_user());
-- Uploads go to '<transaction_id>/<file>' and require edit rights on that transaction.
create policy "receipts: editors upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'receipts'
    and public.can_edit_transaction(
      case
        when (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
        then ((storage.foldername(name))[1])::uuid
      end
    )
  );
create policy "receipts: editors delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'receipts'
    and (
      public.is_admin()
      or (
        (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
        and public.can_edit_transaction(((storage.foldername(name))[1])::uuid)
      )
    )
  );

-------------------------------------------------------------------------------
-- Read model: transactions joined with names + running balance
-------------------------------------------------------------------------------
create or replace view public.transactions_view
with (security_invoker = true)
as
select
  t.*,
  case when t.type = 'in' then t.amount else -t.amount end as signed_amount,
  sum(case when t.type = 'in' then t.amount else -t.amount end)
    over (order by t.txn_date, t.txn_no rows between unbounded preceding and current row)
    as running_balance,
  c.name  as category_name,
  pb.name as paid_by_name,
  pt.name as paid_to_name,
  pr.full_name as created_by_name,
  pr.email     as created_by_email,
  (select count(*) from public.attachments a where a.transaction_id = t.id) as attachment_count
from public.transactions t
left join public.categories c on c.id = t.category_id
left join public.people pb    on pb.id = t.paid_by_id
left join public.people pt    on pt.id = t.paid_to_id
left join public.profiles pr  on pr.id = t.created_by;

-------------------------------------------------------------------------------
-- Reporting functions (SECURITY INVOKER → RLS applies). Amounts are returned as
-- text so no precision is lost in JSON.
-------------------------------------------------------------------------------
create or replace function public.report_totals(p_from date default null, p_to date default null)
returns table (total_in text, total_out text, balance text, txn_count bigint, in_count bigint, out_count bigint)
language sql stable security invoker set search_path = ''
as $$
  select
    coalesce(sum(amount) filter (where type = 'in'), 0)::numeric(14,2)::text,
    coalesce(sum(amount) filter (where type = 'out'), 0)::numeric(14,2)::text,
    coalesce(sum(case when type = 'in' then amount else -amount end), 0)::numeric(14,2)::text,
    count(*),
    count(*) filter (where type = 'in'),
    count(*) filter (where type = 'out')
  from public.transactions
  where (p_from is null or txn_date >= p_from)
    and (p_to   is null or txn_date <= p_to);
$$;

create or replace function public.report_by_category(
  p_from date default null, p_to date default null, p_type text default 'out')
returns table (category_id uuid, category_name text, total text, txn_count bigint)
language sql stable security invoker set search_path = ''
as $$
  select t.category_id,
         coalesce(c.name, 'Uncategorised'),
         sum(t.amount)::numeric(14,2)::text,
         count(*)
  from public.transactions t
  left join public.categories c on c.id = t.category_id
  where t.type = p_type
    and (p_from is null or t.txn_date >= p_from)
    and (p_to   is null or t.txn_date <= p_to)
  group by t.category_id, c.name
  order by sum(t.amount) desc;
$$;

create or replace function public.report_by_person(p_from date default null, p_to date default null)
returns table (
  person_id uuid, person_name text,
  paid_in text, paid_out text, received_in text, received_out text, txn_count bigint)
language sql stable security invoker set search_path = ''
as $$
  with roles as (
    select paid_by_id as person_id, type, amount, 'by' as side, txn_date
    from public.transactions where paid_by_id is not null
    union all
    select paid_to_id, type, amount, 'to', txn_date
    from public.transactions where paid_to_id is not null
  )
  select r.person_id, p.name,
    coalesce(sum(r.amount) filter (where r.side = 'by' and r.type = 'in'), 0)::numeric(14,2)::text,
    coalesce(sum(r.amount) filter (where r.side = 'by' and r.type = 'out'), 0)::numeric(14,2)::text,
    coalesce(sum(r.amount) filter (where r.side = 'to' and r.type = 'in'), 0)::numeric(14,2)::text,
    coalesce(sum(r.amount) filter (where r.side = 'to' and r.type = 'out'), 0)::numeric(14,2)::text,
    count(*)
  from roles r
  join public.people p on p.id = r.person_id
  where (p_from is null or r.txn_date >= p_from)
    and (p_to   is null or r.txn_date <= p_to)
  group by r.person_id, p.name
  order by sum(r.amount) desc;
$$;

create or replace function public.report_by_period(
  p_from date default null, p_to date default null, p_grain text default 'month')
returns table (period date, total_in text, total_out text, txn_count bigint)
language sql stable security invoker set search_path = ''
as $$
  select
    date_trunc(
      case when p_grain in ('day', 'week', 'month') then p_grain else 'month' end,
      txn_date
    )::date,
    coalesce(sum(amount) filter (where type = 'in'), 0)::numeric(14,2)::text,
    coalesce(sum(amount) filter (where type = 'out'), 0)::numeric(14,2)::text,
    count(*)
  from public.transactions
  where (p_from is null or txn_date >= p_from)
    and (p_to   is null or txn_date <= p_to)
  group by 1
  order by 1;
$$;

-------------------------------------------------------------------------------
-- Atomic, idempotent historical import (service role only)
-------------------------------------------------------------------------------
-- p_rows: [{source_ref, source_row, source_hash, source_raw, txn_date, date_inferred,
--           type, amount, description, category, category_inferred, payment_method,
--           payment_method_detail, paid_by, paid_to, notes}]
-- Returns one row per input with the outcome.
create or replace function public.import_transactions(p_source text, p_rows jsonb)
returns table (source_ref text, outcome text, transaction_id uuid, detail text)
language plpgsql security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  r          jsonb;
  v_existing public.transactions%rowtype;
  v_dup      public.transactions%rowtype;
  v_by       uuid;
  v_to       uuid;
  v_cat      uuid;
  v_id       uuid;
begin
  if p_source not in ('sheet_import', 'csv_import') then
    raise exception 'invalid source %', p_source;
  end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    -- 1. Same spreadsheet row already imported?
    select * into v_existing from public.transactions t
      where t.source = p_source and t.source_ref = r ->> 'source_ref';
    if found then
      if v_existing.source_hash is distinct from r ->> 'source_hash' then
        source_ref := r ->> 'source_ref'; outcome := 'changed_in_source';
        transaction_id := v_existing.id;
        detail := 'Row content differs from the imported copy; the app record was NOT overwritten.';
      else
        source_ref := r ->> 'source_ref'; outcome := 'already_imported';
        transaction_id := v_existing.id; detail := null;
      end if;
      return next; continue;
    end if;

    -- 2. Identical content already imported under another row (rows were inserted/moved)?
    select * into v_dup from public.transactions t
      where t.source = p_source and t.source_hash = r ->> 'source_hash' limit 1;
    if found then
      source_ref := r ->> 'source_ref'; outcome := 'duplicate_content';
      transaction_id := v_dup.id;
      detail := 'Identical content was already imported as ' || v_dup.source_ref || '; skipped.';
      return next; continue;
    end if;

    -- 3. Resolve / create people and category by case-insensitive name.
    v_by := null; v_to := null; v_cat := null;
    if nullif(btrim(r ->> 'paid_by'), '') is not null then
      insert into public.people (name, created_by)
        values (regexp_replace(btrim(r ->> 'paid_by'), '\s+', ' ', 'g'), null)
        on conflict (lower(regexp_replace(btrim(name), '\s+', ' ', 'g'))) do nothing;
      select p.id into v_by from public.people p
        where lower(regexp_replace(btrim(p.name), '\s+', ' ', 'g'))
            = lower(regexp_replace(btrim(r ->> 'paid_by'), '\s+', ' ', 'g'));
    end if;
    if nullif(btrim(r ->> 'paid_to'), '') is not null then
      insert into public.people (name, created_by)
        values (regexp_replace(btrim(r ->> 'paid_to'), '\s+', ' ', 'g'), null)
        on conflict (lower(regexp_replace(btrim(name), '\s+', ' ', 'g'))) do nothing;
      select p.id into v_to from public.people p
        where lower(regexp_replace(btrim(p.name), '\s+', ' ', 'g'))
            = lower(regexp_replace(btrim(r ->> 'paid_to'), '\s+', ' ', 'g'));
    end if;
    if nullif(btrim(r ->> 'category'), '') is not null then
      select c.id into v_cat from public.categories c
        where lower(btrim(c.name)) = lower(btrim(r ->> 'category'));
      if v_cat is null then
        raise exception 'Unknown category "%" for %', r ->> 'category', r ->> 'source_ref';
      end if;
    end if;

    insert into public.transactions (
      txn_date, type, amount, description, category_id, category_inferred,
      payment_method, payment_method_detail, paid_by_id, paid_to_id, notes,
      source, source_ref, source_row, source_hash, source_raw, date_inferred, created_by)
    values (
      (r ->> 'txn_date')::date,
      r ->> 'type',
      (r ->> 'amount')::numeric(14,2),
      nullif(r ->> 'description', ''),
      v_cat,
      coalesce((r ->> 'category_inferred')::boolean, false),
      nullif(r ->> 'payment_method', ''),
      nullif(r ->> 'payment_method_detail', ''),
      v_by, v_to,
      nullif(r ->> 'notes', ''),
      p_source,
      r ->> 'source_ref',
      (r ->> 'source_row')::integer,
      r ->> 'source_hash',
      r -> 'source_raw',
      coalesce((r ->> 'date_inferred')::boolean, false),
      null)
    returning id into v_id;

    source_ref := r ->> 'source_ref'; outcome := 'imported';
    transaction_id := v_id; detail := null;
    return next;
  end loop;
end;
$$;

revoke all on function public.import_transactions(text, jsonb) from public, anon, authenticated;
grant execute on function public.import_transactions(text, jsonb) to service_role;
