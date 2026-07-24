-- Sent bids stop showing as overdue; instead they get a follow-up reminder.
-- Default days in Settings, overridable per bid.

alter table public.bids add column if not exists sent_at timestamptz;
alter table public.bids add column if not exists followup_days int; -- null = use the setting

-- bids already sitting in Sent: start their clock from the last edit
update public.bids set sent_at = updated_at where status = 'sent' and sent_at is null;

insert into public.settings (key, label, group_name, value, format, sort_order) values
  ('followup_days', 'Follow up on sent bids after (days)', 'App', 7, 'days', 235)
on conflict (key) do nothing;
