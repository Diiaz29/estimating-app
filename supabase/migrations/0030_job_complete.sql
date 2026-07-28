-- Finished jobs leave the active Jobs list (still won for reports/history).
alter table public.bids add column if not exists completed_at timestamptz;
