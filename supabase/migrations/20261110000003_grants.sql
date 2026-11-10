-- Explicit privileges for the Data API roles.
-- Newer Supabase projects no longer grant table access to anon/authenticated/
-- service_role automatically, so grant exactly what the app needs.
-- Row Level Security still decides which rows each user can see or change.
-- The anonymous role gets nothing at all.

grant usage on schema public to authenticated, service_role;

grant select, insert, update, delete
  on public.profiles, public.people, public.categories, public.transactions, public.attachments
  to authenticated, service_role;

grant select on public.transactions_view to authenticated, service_role;

grant usage, select on all sequences in schema public to authenticated, service_role;

grant execute on function
  public.report_totals(date, date),
  public.report_by_category(date, date, text),
  public.report_by_person(date, date),
  public.report_by_period(date, date, text),
  public.is_active_user(),
  public.is_admin(),
  public.can_edit_transaction(uuid)
  to authenticated, service_role;

revoke all on public.profiles, public.people, public.categories, public.transactions, public.attachments,
  public.transactions_view from anon;
