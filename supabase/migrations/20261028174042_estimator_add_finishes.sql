-- Estimators may create library finishes. Existing finishes remain admin-managed.
-- Keep the existing team SELECT and admin ALL policies unchanged.
create policy "editor insert" on public.finishes
  for insert to authenticated
  with check ((select public.can_edit()));
