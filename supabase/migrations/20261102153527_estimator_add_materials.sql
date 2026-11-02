-- Materials and hardware share this table. Editors may add active entries;
-- updates, retirement, and deletion remain covered by the admin-only policy.
create policy "editor insert active materials" on public.materials
  for insert to authenticated
  with check (active and (select public.can_edit()));
