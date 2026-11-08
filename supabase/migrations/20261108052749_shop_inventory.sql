create table public.shop_inventory (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 1 and 200),
  unit text not null default 'each' check (unit in ('each','case','gal','ft')),
  on_hand numeric not null default 0 check (on_hand >= 0 and on_hand <= 1000000),
  minimum numeric not null default 0 check (minimum >= 0 and minimum <= 1000000),
  notes text not null default '' check (length(notes) <= 4000),
  checked_at timestamptz not null default now(),
  checked_by uuid default auth.uid() references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.shop_inventory enable row level security;
revoke all on public.shop_inventory from anon, authenticated;
grant select on public.shop_inventory to authenticated;
grant insert (title,unit,on_hand,minimum,notes), update (title,unit,on_hand,minimum,notes) on public.shop_inventory to authenticated;
create policy shop_inventory_read on public.shop_inventory for select to authenticated
using ((select public.role_of()) in ('admin','estimator','pm','office','viewer','shop'));
create policy shop_inventory_create on public.shop_inventory for insert to authenticated
with check ((select public.role_of()) in ('admin','estimator','pm'));
create policy shop_inventory_update on public.shop_inventory for update to authenticated
using ((select public.role_of()) in ('admin','estimator','pm'))
with check ((select public.role_of()) in ('admin','estimator','pm'));

create function public.stamp_stock_count() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  new.checked_at := now();
  new.checked_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.stamp_stock_count() from public;
create trigger stamp_stock_count before insert or update on public.shop_inventory
for each row execute function public.stamp_stock_count();
