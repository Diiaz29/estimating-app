-- Receipts get the date on the receipt (upload time stays in created_at).
alter table public.receipts add column if not exists receipt_date date;
update public.receipts set receipt_date = created_at::date where receipt_date is null;
