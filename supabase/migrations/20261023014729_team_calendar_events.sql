-- Shared calendar dates are independent of production tasks and pricing.
create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  bid_id uuid references public.bids(id) on delete cascade,
  kind text not null check (kind in ('custom', 'build', 'install')),
  title text not null check (length(trim(title)) between 1 and 200),
  event_date date not null,
  event_time time,
  notes text not null default '' check (length(notes) <= 4000),
  deleted_at timestamptz,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint calendar_job_required check (kind = 'custom' or bid_id is not null)
);
create index calendar_events_date_idx on public.calendar_events(event_date) where deleted_at is null;
create index calendar_events_bid_idx on public.calendar_events(bid_id);
create index calendar_events_creator_idx on public.calendar_events(created_by);
alter table public.calendar_events enable row level security;
grant select, insert, update on public.calendar_events to authenticated;
revoke all on public.calendar_events from anon;
create policy "team calendar read" on public.calendar_events for select to authenticated
  using (public.role_of() in ('admin','estimator','pm','office','viewer','shop'));
create policy "scheduler calendar insert" on public.calendar_events for insert to authenticated
  with check (public.can_schedule() and created_by = auth.uid());
create policy "scheduler calendar update" on public.calendar_events for update to authenticated
  using (public.can_schedule()) with check (public.can_schedule());
