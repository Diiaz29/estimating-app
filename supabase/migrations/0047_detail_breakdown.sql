-- Optional customer-facing detail on the proposal: per-cabinet materials and
-- labor at the charged price, plus each added cost. Off by default per bid.
alter table public.bids add column if not exists detail_breakdown boolean not null default false;

notify pgrst, 'reload schema';
