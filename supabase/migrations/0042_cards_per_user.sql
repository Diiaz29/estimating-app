-- Cards are admin-managed and assigned to a person. Uploads default to the
-- uploader's card; office reconciles by card and gets flagged when a receipt
-- came from someone with no card on file.
alter table public.payment_methods add column if not exists owner_id uuid references public.profiles (id) on delete set null;

drop policy if exists "office pm admin write" on public.payment_methods;
create policy "admin write" on public.payment_methods for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- receipts remember who uploaded them by account too (email already stored)
alter table public.receipts add column if not exists needs_card_review boolean not null default false;
