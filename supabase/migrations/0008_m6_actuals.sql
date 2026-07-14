-- M6: estimated-vs-actual job costing. Shows real profit, so admin-only.
create table public.job_actuals (
  bid_id uuid primary key references public.bids (id) on delete cascade,
  material_cost numeric,
  shop_hours numeric,
  install_hours numeric,
  delivery_cost numeric,
  travel_cost numeric,
  sub_cost numeric,
  other_cost numeric,
  notes text,
  updated_by text,
  updated_at timestamptz not null default now()
);

alter table public.job_actuals enable row level security;
create policy "admin only" on public.job_actuals
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
