-- The short terms list on the proposal cover page becomes editable too.
insert into public.text_settings (key, label, value, sort_order) values
  ('proposal_terms_summary', 'Proposal cover — short terms list (one per line)',
'Payment NET 30 days from invoice date; no retainage withheld.
Lump-sum invoice on completion, or periodic pay apps for work in place.
Pricing valid for 30 days.
Change orders approved in writing before work proceeds.', 5)
on conflict (key) do nothing;
