-- Plan room: measurements persist per sheet (same write rules as calibrations).
create table public.plan_measurements (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans (id) on delete cascade,
  page integer not null,
  ax numeric not null,
  ay numeric not null,
  bx numeric not null,
  by numeric not null,
  created_at timestamptz not null default now()
);
create index plan_measurements_plan_page on public.plan_measurements (plan_id, page);

alter table public.plan_measurements enable row level security;
create policy "team read" on public.plan_measurements for select to authenticated using (true);
create policy "scheduler write" on public.plan_measurements for all to authenticated
  using (public.can_schedule()) with check (public.can_schedule());
