-- Viewer (read-only) and PM (manages schedule + production) roles.
alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('admin', 'estimator', 'pm', 'viewer'));

create or replace function public.role_of()
returns text language sql security definer set search_path = public stable
as $$ select role from public.profiles where id = auth.uid(); $$;

create or replace function public.can_edit()
returns boolean language sql security definer set search_path = public stable
as $$ select public.role_of() in ('admin', 'estimator'); $$;

create or replace function public.can_schedule()
returns boolean language sql security definer set search_path = public stable
as $$ select public.role_of() in ('admin', 'estimator', 'pm'); $$;

-- customers & bids: writes become editor-only (read stays open to all roles)
drop policy "team insert" on public.customers;
drop policy "team update" on public.customers;
create policy "editor insert" on public.customers for insert to authenticated with check (public.can_edit());
create policy "editor update" on public.customers for update to authenticated using (public.can_edit()) with check (public.can_edit());

drop policy "team insert" on public.bids;
drop policy "team update" on public.bids;
create policy "editor insert" on public.bids for insert to authenticated with check (public.can_edit());
create policy "editor update" on public.bids for update to authenticated using (public.can_edit()) with check (public.can_edit());

-- estimate-side tables: split blanket access into read-for-all + editor writes
drop policy "team full access" on public.contacts;
create policy "team read" on public.contacts for select to authenticated using (true);
create policy "editor write" on public.contacts for all to authenticated using (public.can_edit()) with check (public.can_edit());

drop policy "team full access" on public.bid_customers;
create policy "team read" on public.bid_customers for select to authenticated using (true);
create policy "editor write" on public.bid_customers for all to authenticated using (public.can_edit()) with check (public.can_edit());

drop policy "team full access" on public.areas;
create policy "team read" on public.areas for select to authenticated using (true);
create policy "editor write" on public.areas for all to authenticated using (public.can_edit()) with check (public.can_edit());

drop policy "team full access" on public.line_items;
create policy "team read" on public.line_items for select to authenticated using (true);
create policy "editor write" on public.line_items for all to authenticated using (public.can_edit()) with check (public.can_edit());

drop policy "team full access" on public.bid_finishes;
create policy "team read" on public.bid_finishes for select to authenticated using (true);
create policy "editor write" on public.bid_finishes for all to authenticated using (public.can_edit()) with check (public.can_edit());

drop policy "team full access" on public.bid_material_overrides;
create policy "team read" on public.bid_material_overrides for select to authenticated using (true);
create policy "editor write" on public.bid_material_overrides for all to authenticated using (public.can_edit()) with check (public.can_edit());

drop policy "team insert" on public.revisions;
create policy "editor insert" on public.revisions for insert to authenticated with check (public.can_edit());

-- production tables: PM can write these too
drop policy "team full access" on public.job_tasks;
create policy "team read" on public.job_tasks for select to authenticated using (true);
create policy "scheduler write" on public.job_tasks for all to authenticated using (public.can_schedule()) with check (public.can_schedule());

drop policy "team full access" on public.order_checks;
create policy "team read" on public.order_checks for select to authenticated using (true);
create policy "scheduler write" on public.order_checks for all to authenticated using (public.can_schedule()) with check (public.can_schedule());

drop policy "team full access" on public.receipts;
create policy "team read" on public.receipts for select to authenticated using (true);
create policy "scheduler write" on public.receipts for all to authenticated using (public.can_schedule()) with check (public.can_schedule());

-- receipt files: uploads/deletes follow the same rule
drop policy "team receipts write" on storage.objects;
drop policy "team receipts delete" on storage.objects;
create policy "scheduler receipts write" on storage.objects
  for insert to authenticated with check (bucket_id = 'receipts' and public.can_schedule());
create policy "scheduler receipts delete" on storage.objects
  for delete to authenticated using (bucket_id = 'receipts' and public.can_schedule());
