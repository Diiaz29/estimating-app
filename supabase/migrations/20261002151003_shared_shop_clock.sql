alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('admin','estimator','pm','viewer','office','shop'));

create table public.shop_workers (
  id uuid primary key default gen_random_uuid(),
  login_id uuid not null references public.profiles(id),
  first_name text not null check (length(trim(first_name)) between 1 and 80),
  last_name text not null check (length(trim(last_name)) between 1 and 80),
  active boolean not null default true
);
alter table public.shop_workers enable row level security;
create index shop_workers_login on public.shop_workers(login_id);
grant select,insert,update,delete on public.shop_workers to authenticated;
revoke all on public.shop_workers from anon;
create policy "read own shop workers" on public.shop_workers for select to authenticated
  using (login_id=(select auth.uid()) or (select public.is_admin()));
create policy "admins manage shop workers" on public.shop_workers for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create table public.shop_shifts (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.shop_workers(id),
  bid_id uuid not null references public.bids(id),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  note text,
  time_entry_id uuid references public.time_entries(id) on delete set null
);
create unique index one_open_shop_shift on public.shop_shifts(worker_id) where ended_at is null;
alter table public.shop_shifts enable row level security;
revoke all on public.shop_shifts from anon,authenticated;
grant select on public.shop_shifts to authenticated;
create policy "read own shop shifts" on public.shop_shifts for select to authenticated
  using ((select public.is_admin()) or exists(select 1 from public.shop_workers w where w.id=worker_id and w.login_id=(select auth.uid())));
alter table public.time_entries add column shop_worker_id uuid references public.shop_workers(id);
create index time_entries_shop_worker on public.time_entries(shop_worker_id);
drop policy "team read time" on public.time_entries;
create policy "team read time" on public.time_entries for select to authenticated
  using ((select public.role_of()) <> 'shop' or created_by=(select auth.jwt()->>'email'));

-- Shop accounts create completed time only through the clock-out function.
drop policy "team log time" on public.time_entries;
create policy "team log time" on public.time_entries for insert to authenticated
  with check ((select public.role_of()) <> 'shop' and shop_worker_id is null);

create function public.start_shop_shift(p_worker_id uuid,p_bid_id uuid,p_note text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare shift_id uuid;
begin
  if auth.uid() is null or public.role_of()<>'shop' then raise exception 'Shop login required'; end if;
  if not exists(select 1 from public.shop_workers where id=p_worker_id and login_id=auth.uid() and active) then raise exception 'Choose an active worker assigned to this login'; end if;
  if not exists(select 1 from public.bids where id=p_bid_id and status='won' and completed_at is null) then raise exception 'Choose an active job'; end if;
  insert into public.shop_shifts(worker_id,bid_id,note) values(p_worker_id,p_bid_id,nullif(trim(p_note),'')) returning id into shift_id;
  return shift_id;
exception when unique_violation then raise exception 'This worker is already clocked in';
end $$;

create function public.stop_shop_shift(p_shift_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare shift public.shop_shifts; worker public.shop_workers; stopped timestamptz := clock_timestamp(); entry_id uuid;
begin
  if auth.uid() is null or public.role_of()<>'shop' then raise exception 'Shop login required'; end if;
  select * into shift from public.shop_shifts where id=p_shift_id for update;
  if not found then raise exception 'Shift not found'; end if;
  select * into worker from public.shop_workers where id=shift.worker_id;
  if worker.login_id is distinct from auth.uid() then raise exception 'This shift belongs to another login'; end if;
  if shift.ended_at is not null then return shift.time_entry_id; end if;
  insert into public.time_entries(bid_id,worker,work_date,hours,note,kind,night,created_by,shop_worker_id)
    values(shift.bid_id,worker.first_name||' '||worker.last_name,(shift.started_at at time zone 'America/Chicago')::date,
      greatest(0.01,round((extract(epoch from stopped-shift.started_at)/3600)::numeric,2)),shift.note,'shop',false,
      (select email from public.profiles where id=auth.uid()),worker.id) returning id into entry_id;
  update public.shop_shifts set ended_at=stopped,time_entry_id=entry_id where id=shift.id;
  return entry_id;
end $$;
revoke all on function public.start_shop_shift(uuid,uuid,text),public.stop_shop_shift(uuid) from public,anon;
grant execute on function public.start_shop_shift(uuid,uuid,text),public.stop_shop_shift(uuid) to authenticated;
