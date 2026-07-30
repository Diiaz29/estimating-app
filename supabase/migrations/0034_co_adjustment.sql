-- Per-change-order price adjustment (discount or add on top of the scope pricing).
alter table public.change_orders add column if not exists price_adjustment numeric not null default 0;
