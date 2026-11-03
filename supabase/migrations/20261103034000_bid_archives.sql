-- Separate metadata keeps archival out of estimate fingerprints and snapshots.
create table public.bid_archives (
  bid_id uuid primary key references public.bids(id) on delete cascade,
  archived_at timestamptz not null default now(),
  archived_by uuid default auth.uid() references public.profiles(id) on delete set null
);
alter table public.bid_archives enable row level security;
grant select, insert, delete on public.bid_archives to authenticated;
revoke all on public.bid_archives from anon;
create policy "team reads archives" on public.bid_archives
  for select to authenticated using (true);
create policy "bid managers archive" on public.bid_archives
  for insert to authenticated with check (
    public.role_of() in ('admin', 'estimator', 'office')
    and archived_by = auth.uid()
    and exists (select 1 from public.bids where id = bid_id and status <> 'won')
  );
create policy "bid managers restore" on public.bid_archives
  for delete to authenticated using (public.role_of() in ('admin', 'estimator', 'office'));
