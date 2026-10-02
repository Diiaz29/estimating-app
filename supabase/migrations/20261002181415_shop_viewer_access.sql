-- Shop has Viewer read access; worker clocks and admin-only corrections remain separate.
drop policy "team read time" on public.time_entries;
create policy "team read time" on public.time_entries
  for select to authenticated using (true);
