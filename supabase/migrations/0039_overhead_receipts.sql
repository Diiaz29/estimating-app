-- Receipts that aren't for a job: overhead / office / shop expenses.
-- bid_id becomes optional; overhead receipts carry their own category.
alter table public.receipts alter column bid_id drop not null;
alter table public.receipts add column if not exists is_overhead boolean not null default false;
alter table public.receipts add column if not exists overhead_category text;
alter table public.receipts add constraint receipts_target_check
  check (is_overhead or bid_id is not null);
