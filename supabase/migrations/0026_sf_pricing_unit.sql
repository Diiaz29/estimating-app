-- Countertops price by the square foot: add SF as a pricing unit.
alter table public.assemblies drop constraint assemblies_pricing_unit_check;
alter table public.assemblies add constraint assemblies_pricing_unit_check
  check (pricing_unit in ('EA', 'LF', 'SF'));
