-- Choose whether the price adjustment prints as its own proposal line
-- or folds silently into the total.
alter table public.bids add column if not exists adjustment_visible boolean not null default true;
