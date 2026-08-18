-- Editable overhead receipt categories (office/admin manage them from the Receipts tab).
create table public.overhead_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.overhead_categories enable row level security;
create policy "team read" on public.overhead_categories for select to authenticated using (true);
create policy "office pm admin write" on public.overhead_categories for all to authenticated
  using (public.can_schedule() or public.role_of() = 'office')
  with check (public.can_schedule() or public.role_of() = 'office');

insert into public.overhead_categories (name, sort_order) values
  ('rent', 10), ('utilities', 20), ('vehicles', 30), ('insurance', 40),
  ('tools & supplies', 50), ('software', 60), ('office', 70), ('other', 80)
on conflict (name) do nothing;
