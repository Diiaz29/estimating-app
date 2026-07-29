-- Manual price adjustment on a bid: discount (negative) or add (positive),
-- applied after the added costs. Note prints on the proposal.
alter table public.bids add column if not exists price_adjustment numeric not null default 0;
alter table public.bids add column if not exists adjustment_note text;
