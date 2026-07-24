-- Simpler pipeline: Takeoff and Pricing merge into one "Working" stage.
-- Received -> Working -> Sent -> Won/Lost

alter table public.bids drop constraint bids_status_check;
update public.bids set status = 'working' where status in ('takeoff', 'pricing');
alter table public.bids add constraint bids_status_check
  check (status in ('received', 'working', 'sent', 'won', 'lost'));
