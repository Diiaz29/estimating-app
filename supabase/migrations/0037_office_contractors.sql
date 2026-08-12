-- Office can add and edit contractors (companies + contacts). No delete.
create policy "office customers insert" on public.customers
  for insert to authenticated with check (public.role_of() = 'office');
create policy "office customers update" on public.customers
  for update to authenticated using (public.role_of() = 'office') with check (public.role_of() = 'office');
create policy "office contacts insert" on public.contacts
  for insert to authenticated with check (public.role_of() = 'office');
create policy "office contacts update" on public.contacts
  for update to authenticated using (public.role_of() = 'office') with check (public.role_of() = 'office');
