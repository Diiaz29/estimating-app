-- Personal completion markers; receipt data and financial reports are untouched.
create table public.receipt_quickbooks_marks (
  user_id uuid not null references auth.users(id) on delete cascade,
  receipt_id uuid not null references public.receipts(id) on delete cascade,
  recorded_at timestamptz not null default now(),
  primary key (user_id, receipt_id)
);
create index receipt_quickbooks_marks_receipt_idx on public.receipt_quickbooks_marks(receipt_id);
alter table public.receipt_quickbooks_marks enable row level security;
revoke all on public.receipt_quickbooks_marks from anon, authenticated;
grant select, insert, update, delete on public.receipt_quickbooks_marks to authenticated;
create policy "personal receipt bookkeeping" on public.receipt_quickbooks_marks
  for all to authenticated
  using (user_id = (select auth.uid()) and public.role_of() in ('office', 'admin'))
  with check (user_id = (select auth.uid()) and public.role_of() in ('office', 'admin'));
