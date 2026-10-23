-- One record covers an inclusive range; existing events remain single-day.
alter table public.calendar_events add column end_date date;
update public.calendar_events set end_date = event_date where end_date is null;
alter table public.calendar_events alter column end_date set not null;
alter table public.calendar_events add constraint calendar_event_date_range check (end_date >= event_date);
