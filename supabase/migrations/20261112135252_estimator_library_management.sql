-- Admins and estimators share full library management. Other app permissions
-- and existing library read policies are unchanged.
create policy "editor library write" on public.materials
  for all to authenticated using ((select public.can_edit())) with check ((select public.can_edit()));
create policy "editor library write" on public.finishes
  for all to authenticated using ((select public.can_edit())) with check ((select public.can_edit()));
create policy "editor library write" on public.assemblies
  for all to authenticated using ((select public.can_edit())) with check ((select public.can_edit()));
create policy "editor library write" on public.assembly_materials
  for all to authenticated using ((select public.can_edit())) with check ((select public.can_edit()));
