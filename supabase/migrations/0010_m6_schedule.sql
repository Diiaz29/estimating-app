-- M6: production schedule — tasks per job, business-day based, with company holidays.
create table public.job_tasks (
  id uuid primary key default gen_random_uuid(),
  bid_id uuid not null references public.bids (id) on delete cascade,
  name text not null,
  start_date date,
  business_days numeric not null default 1,
  done boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.holidays (
  day date primary key,
  name text
);

alter table public.job_tasks enable row level security;
alter table public.holidays enable row level security;

create policy "team full access" on public.job_tasks
  for all to authenticated using (true) with check (true);
create policy "team read" on public.holidays for select to authenticated using (true);
create policy "admin write" on public.holidays for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
