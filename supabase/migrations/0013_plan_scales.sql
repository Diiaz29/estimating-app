-- Plan room measuring: remembered scale calibration per plan page.
create table public.plan_scales (
  plan_id uuid not null references public.plans (id) on delete cascade,
  page integer not null,
  feet_per_unit numeric not null,   -- real feet per PDF point at 100% scale
  calibrated_by text,
  updated_at timestamptz not null default now(),
  primary key (plan_id, page)
);

alter table public.plan_scales enable row level security;
create policy "team read" on public.plan_scales for select to authenticated using (true);
create policy "scheduler write" on public.plan_scales for all to authenticated
  using (public.can_schedule()) with check (public.can_schedule());
