alter table public.shop_shifts add column kind text not null default 'shop' check (kind in ('shop','field'));
alter table public.shop_shifts add column night boolean not null default false;

-- Defaults keep existing clients and shifts compatible during rollout.
drop function public.start_shop_shift(uuid,uuid,text);
create function public.start_shop_shift(p_worker_id uuid,p_bid_id uuid,p_note text default null,p_kind text default 'shop',p_night boolean default false)
returns uuid language plpgsql security definer set search_path=public as $$
declare shift_id uuid;
begin
  if auth.uid() is null or public.role_of() is distinct from 'shop' then raise exception 'Shop login required'; end if;
  if p_kind is null or p_kind not in ('shop','field') or p_night is null then raise exception 'Choose Shop or Install time and a night work setting'; end if;
  if not exists(select 1 from public.shop_workers where id=p_worker_id and login_id=auth.uid() and active) then raise exception 'Choose an active worker assigned to this login'; end if;
  if not exists(select 1 from public.bids where id=p_bid_id and status='won' and completed_at is null) then raise exception 'Choose an active job'; end if;
  insert into public.shop_shifts(worker_id,bid_id,note,kind,night) values(p_worker_id,p_bid_id,nullif(trim(p_note),''),p_kind,p_night) returning id into shift_id;
  return shift_id;
exception when unique_violation then raise exception 'This worker is already clocked in';
end $$;
revoke all on function public.start_shop_shift(uuid,uuid,text,text,boolean) from public,anon;
grant execute on function public.start_shop_shift(uuid,uuid,text,text,boolean) to authenticated;

create or replace function public.stop_shop_shift(p_shift_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare shift public.shop_shifts; worker public.shop_workers; stopped timestamptz := clock_timestamp(); entry_id uuid;
begin
  if auth.uid() is null or public.role_of() is distinct from 'shop' then raise exception 'Shop login required'; end if;
  select * into shift from public.shop_shifts where id=p_shift_id for update;
  if not found then raise exception 'Shift not found'; end if;
  select * into worker from public.shop_workers where id=shift.worker_id;
  if worker.login_id is distinct from auth.uid() then raise exception 'This shift belongs to another login'; end if;
  if shift.ended_at is not null then return shift.time_entry_id; end if;
  insert into public.time_entries(bid_id,worker,work_date,hours,note,kind,night,created_by,shop_worker_id)
    values(shift.bid_id,worker.first_name||' '||worker.last_name,(shift.started_at at time zone 'America/Chicago')::date,
      greatest(0.01,round((extract(epoch from stopped-shift.started_at)/3600)::numeric,2)),shift.note,shift.kind,shift.night,
      (select email from public.profiles where id=auth.uid()),worker.id) returning id into entry_id;
  update public.shop_shifts set ended_at=stopped,time_entry_id=entry_id where id=shift.id;
  return entry_id;
end $$;
