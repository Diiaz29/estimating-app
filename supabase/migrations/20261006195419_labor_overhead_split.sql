-- Display allocation only: do not change the applied combined cost rate.
alter table public.overhead_items add column labor_pct numeric not null default 0
  check (labor_pct >= 0 and labor_pct <= 100);
-- Owner-confirmed initial classification. All other existing costs stay overhead.
update public.overhead_items set labor_pct = 100
  where lower(trim(name)) in ('jorge''s salary', 'shop employee');
insert into public.settings (key, label, group_name, value, format, sort_order)
select 'cost_labor_share', 'Labor share of combined cost', 'Overhead',
  coalesce(sum(amount * case when period = 'monthly' then 12 else 1 end * labor_pct / 100)
  / nullif(sum(amount * case when period = 'monthly' then 12 else 1 end), 0), 0), 'factor', 40
from public.overhead_items
on conflict (key) do nothing;
update public.settings set label = 'Labor + overhead cost ($/hr)' where key = 'cost_shop_rate';
