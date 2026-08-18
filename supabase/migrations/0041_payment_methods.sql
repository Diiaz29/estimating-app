-- How a receipt was paid: cards, cash, check, account. Managed like overhead categories.
create table public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,        -- e.g. "Visa 4421 — Brandon"
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.payment_methods enable row level security;
create policy "team read" on public.payment_methods for select to authenticated using (true);
create policy "office pm admin write" on public.payment_methods for all to authenticated
  using (public.can_schedule() or public.role_of() = 'office')
  with check (public.can_schedule() or public.role_of() = 'office');

alter table public.receipts add column if not exists payment_method_id uuid
  references public.payment_methods (id) on delete set null;

insert into public.payment_methods (name, sort_order) values ('cash', 900), ('check', 910)
on conflict (name) do nothing;
