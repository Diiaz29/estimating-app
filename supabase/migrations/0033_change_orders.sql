-- Change orders: post-contract scope changes. A CO owns one or more areas that
-- price like options (excluded, all-in delta) while draft; approving locks the
-- numbers and folds the areas into the contract.
create table public.change_orders (
  id uuid primary key default gen_random_uuid(),
  bid_id uuid not null references public.bids (id) on delete cascade,
  co_number integer not null,
  title text not null,
  description text,
  status text not null default 'draft' check (status in ('draft', 'approved')),
  amount numeric,          -- locked at approval: the all-in add/deduct
  prior_contract numeric,  -- locked at approval: contract before this CO
  created_by text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (bid_id, co_number)
);

alter table public.change_orders enable row level security;
create policy "team read" on public.change_orders for select to authenticated using (true);
create policy "editor write" on public.change_orders for all to authenticated
  using (public.can_edit()) with check (public.can_edit());

alter table public.areas add column if not exists change_order_id uuid
  references public.change_orders (id) on delete set null;
