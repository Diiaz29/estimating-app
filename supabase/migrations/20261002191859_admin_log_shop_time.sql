-- Keep ordinary self-logging unchanged; only admins can attribute manual time to Shop workers.
create policy "admins log shop worker time" on public.time_entries
for insert to authenticated
with check (
  (select public.is_admin())
  and created_by = (select auth.email())
  and exists (
    select 1 from public.shop_workers w
    where w.id = time_entries.shop_worker_id and w.active
      and time_entries.worker = w.first_name || ' ' || w.last_name
  )
);
