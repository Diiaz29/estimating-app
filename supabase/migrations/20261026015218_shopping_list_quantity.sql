alter table public.app_change_requests add column quantity numeric;
alter table public.app_change_requests add constraint app_change_requests_quantity_check
  check (quantity is null or (quantity > 0 and quantity <= 1000000000));
