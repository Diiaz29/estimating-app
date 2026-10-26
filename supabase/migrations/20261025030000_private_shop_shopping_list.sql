-- Extend the private workspace without changing its account restrictions.
alter table public.app_change_requests drop constraint app_change_requests_section_check;
alter table public.app_change_requests add constraint app_change_requests_section_check
  check (section in ('app', 'on_business', 'in_business', 'shopping'));
