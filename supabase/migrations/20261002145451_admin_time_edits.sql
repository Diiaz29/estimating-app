-- Preserve team reading/logging; only admins may change existing entries.
drop policy if exists "team full access" on public.time_entries;
create policy "team read time" on public.time_entries for select to authenticated using (true);
create policy "team log time" on public.time_entries for insert to authenticated with check (true);
create policy "admins edit time" on public.time_entries for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admins delete time" on public.time_entries for delete to authenticated
  using ((select public.is_admin()));
