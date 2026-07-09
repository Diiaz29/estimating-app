-- Overhead calculator: itemized real company costs (salaries, rent, trucks…)
-- that derive the burdened shop cost rate. Salaries live here, so the whole
-- table is admin-only — even for reading.

create table public.overhead_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  amount numeric not null default 0,
  period text not null default 'monthly' check (period in ('monthly', 'yearly')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.overhead_items enable row level security;
create policy "admin only" on public.overhead_items
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Billable-hours assumptions (shown on the Overhead page, not the Settings page)
insert into public.settings (key, label, group_name, value, format, sort_order) values
  ('overhead_heads', 'Crew members doing billable work', 'Overhead', 4, 'number', 10),
  ('overhead_paid_hours', 'Paid hours per person per year', 'Overhead', 2080, 'number', 20),
  ('overhead_utilization', 'Share of paid hours on jobs (%)', 'Overhead', 0.70, 'percent', 30)
on conflict (key) do nothing;
