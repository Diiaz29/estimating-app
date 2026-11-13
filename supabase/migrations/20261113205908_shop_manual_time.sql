-- Manual entries use server-verified worker identity; direct shop inserts stay denied.
create schema if not exists private;
grant usage on schema private to authenticated;

create function private.log_shop_time(p_worker_id uuid, p_bid_id uuid, p_work_date date, p_hours numeric,
  p_note text default null, p_kind text default 'shop', p_night boolean default false)
returns uuid language plpgsql security definer set search_path = '' as $$
declare worker public.shop_workers; entry_id uuid;
begin
  if auth.uid() is null or public.role_of() is distinct from 'shop' then
    raise exception 'Shop login required';
  end if;
  select * into worker from public.shop_workers where id = p_worker_id for share;
  if not found or worker.login_id is distinct from auth.uid() or not worker.active then
    raise exception 'Choose an active worker assigned to this login';
  end if;
  perform 1 from public.bids where id = p_bid_id and status = 'won' and completed_at is null for share;
  if not found then raise exception 'Choose an active job'; end if;
  if p_work_date is null or not isfinite(p_work_date) then raise exception 'Choose a valid date'; end if;
  if p_hours is null or p_hours <= 0 or p_hours > 24 then raise exception 'Enter hours greater than zero and no more than 24'; end if;
  if p_kind is null or p_kind not in ('shop','field','site_visit','punch_list') or p_night is null then
    raise exception 'Choose a valid time category and night work setting';
  end if;
  insert into public.time_entries(bid_id, worker, shop_worker_id, work_date, hours, note, kind, night, created_by)
  values(p_bid_id, worker.first_name || ' ' || worker.last_name, worker.id, p_work_date, p_hours,
    nullif(trim(p_note), ''), p_kind, p_night, (select email from public.profiles where id = auth.uid()))
  returning id into entry_id;
  return entry_id;
end $$;

create function public.log_shop_time(p_worker_id uuid, p_bid_id uuid, p_work_date date, p_hours numeric,
  p_note text default null, p_kind text default 'shop', p_night boolean default false)
returns uuid language sql security invoker set search_path = '' as $$
  select private.log_shop_time(p_worker_id, p_bid_id, p_work_date, p_hours, p_note, p_kind, p_night);
$$;
revoke all on function private.log_shop_time(uuid,uuid,date,numeric,text,text,boolean) from public, anon;
revoke all on function public.log_shop_time(uuid,uuid,date,numeric,text,text,boolean) from public, anon;
grant execute on function private.log_shop_time(uuid,uuid,date,numeric,text,text,boolean) to authenticated;
grant execute on function public.log_shop_time(uuid,uuid,date,numeric,text,text,boolean) to authenticated;
