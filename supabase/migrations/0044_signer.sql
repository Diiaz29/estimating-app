-- Who signs for the company — printed under the signature image on the
-- work authorization and change orders (Settings → Company).
insert into public.text_settings (key, label, value, sort_order, group_name) values
  ('signer_name', 'Signed by (printed name)', '', 60, 'Company'),
  ('signer_title', 'Signer title', '', 70, 'Company')
on conflict (key) do nothing;
