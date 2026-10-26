alter table public.app_change_requests
  add column priority text not null default 'normal' check (priority in ('low','normal','high')),
  add column store_name text not null default '' check (length(store_name) <= 200),
  add column product_url text not null default '' check (length(product_url) <= 2048 and (product_url = '' or product_url ~* '^https?://[^[:space:]]+$'));
