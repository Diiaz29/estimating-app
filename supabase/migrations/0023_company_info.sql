-- Company identity moves out of the code and into editable settings.
alter table public.text_settings add column if not exists group_name text not null default 'Terms';

insert into public.text_settings (key, label, value, sort_order, group_name) values
  ('company_name', 'Company name', 'ZAID Millwork', 10, 'Company'),
  ('company_address', 'Address', '4872 State Highway 276, Royse City, TX 75189', 20, 'Company'),
  ('company_phone', 'Phone', '(972) 722-2322', 30, 'Company'),
  ('company_email', 'Email', 'info@zaidmillwork.com', 40, 'Company'),
  ('company_web', 'Website', 'www.ZAIDmillwork.com', 50, 'Company')
on conflict (key) do nothing;
