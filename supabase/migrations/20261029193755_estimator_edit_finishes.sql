-- Estimators may edit active finishes, including price and descriptive fields.
-- Removing/reactivating finishes remains admin-only through the existing policy.
create policy "editor update active finishes" on public.finishes
  for update to authenticated
  using (active and (select public.can_edit()))
  with check (active and (select public.can_edit()));
