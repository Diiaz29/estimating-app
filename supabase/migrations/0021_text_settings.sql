-- Editable legal text for the Work Authorization Agreement (one bullet per line).
-- Companies bring their own terms; ZAID's current wording is just the seed.

create table public.text_settings (
  key text primary key,
  label text not null,
  value text not null default '',
  sort_order int not null default 0
);

alter table public.text_settings enable row level security;
create policy "team read" on public.text_settings for select to authenticated using (true);
create policy "admin write" on public.text_settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

insert into public.text_settings (key, label, value, sort_order) values
  ('wa_payment_terms', 'Payment terms (one bullet per line)',
'Invoicing: lump-sum invoice on completion or periodic pay apps for work in place, stored materials, and approved change orders.
Payment: NET 30 days from invoice date. No retainage withheld.
Late payment: amounts unpaid after 30 days accrue interest at 1.5%/month or the maximum rate permitted by Texas law.
Not pay-when-paid: payment is not contingent on Contractor receiving payment from any third party.
Change orders: any change to scope, materials, schedule, or price must be approved in writing by both parties before the affected work proceeds.', 10),
  ('wa_conditions', 'Conditions (one bullet per line)',
'Pricing valid for 30 days. Cancellation or postponement within 2 weeks of scheduled start may incur charges for materials, labor, and shop time committed.
Site readiness: project space must be ready when Vendor arrives. Delays caused by others may trigger mobilization, storage, and standby charges at then-current rates.
Site conditions: Contractor provides on-site dumpster, reasonable access, adequate lighting, and protection of finished surfaces from other trades.
Shop drawings and product literature submitted for written approval prior to fabrication.
Title to materials remains with Vendor until full payment is received. Vendor reserves all lien rights afforded under Texas law.
Insurance: Vendor maintains commercial general liability and workers'' compensation coverage; COI furnished upon request.
Warranty: one (1) year from substantial completion against defects in materials and workmanship; excludes misuse and normal wear.
Governing law: State of Texas; venue in the county of Vendor''s principal office.', 20)
on conflict (key) do nothing;
