-- A second price adjustment that never prints — for baking a cost (like
-- insurance a client would push back on) silently into the contract while the
-- visible adjustment stays free for discounts the proposal should show.
alter table public.bids add column if not exists hidden_adjustment numeric not null default 0;

notify pgrst, 'reload schema';
