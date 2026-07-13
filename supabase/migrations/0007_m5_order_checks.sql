-- M5: "ordered" checkboxes on the purchase list, shared by the whole team.
create table public.order_checks (
  bid_id uuid not null references public.bids (id) on delete cascade,
  item_key text not null,              -- mat:<material_id> or fin:<finish_id>
  checked_by text,
  checked_at timestamptz not null default now(),
  primary key (bid_id, item_key)
);

alter table public.order_checks enable row level security;
create policy "team full access" on public.order_checks
  for all to authenticated using (true) with check (true);
