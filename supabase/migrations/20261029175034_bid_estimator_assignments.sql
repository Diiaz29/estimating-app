-- Routing metadata is separate from pricing inputs and submission history.
create table public.bid_estimator_assignments (
  bid_id uuid primary key references public.bids(id) on delete cascade,
  estimator_id uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.bid_estimator_assignments enable row level security;
revoke all on public.bid_estimator_assignments from anon, authenticated;
grant select on public.bid_estimator_assignments to authenticated;
create policy "editors read estimator assignments" on public.bid_estimator_assignments
  for select to authenticated using ((select public.can_edit()));

create function private.assign_bid_estimator(p_bid_id uuid, p_estimator_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not coalesce(public.is_admin(),false) then
    raise exception 'Only admins may assign estimators.' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_bid_id::text,0));
  if not exists(select 1 from public.bids where id=p_bid_id) then raise exception 'Bid not found.' using errcode='P0002'; end if;
  if p_estimator_id is not null and not exists(select 1 from public.profiles where id=p_estimator_id and role in ('admin','estimator')) then
    raise exception 'Choose an admin or estimator.' using errcode='22023';
  end if;
  insert into public.bid_estimator_assignments(bid_id,estimator_id) values(p_bid_id,p_estimator_id)
    on conflict(bid_id) do update set estimator_id=excluded.estimator_id,updated_at=now();
end; $$;
revoke all on function private.assign_bid_estimator(uuid,uuid) from public,anon;
grant usage on schema private to authenticated;
grant execute on function private.assign_bid_estimator(uuid,uuid) to authenticated;
create function public.assign_bid_estimator(p_bid_id uuid,p_estimator_id uuid) returns void
language sql security invoker set search_path='' as $$ select private.assign_bid_estimator(p_bid_id,p_estimator_id); $$;
revoke all on function public.assign_bid_estimator(uuid,uuid) from public,anon;
grant execute on function public.assign_bid_estimator(uuid,uuid) to authenticated;

-- Keep known estimator ownership on existing submissions. Admin submissions are
-- deliberately not guessed; the owner can choose the responsible estimator.
insert into public.bid_estimator_assignments(bid_id,estimator_id)
  select r.bid_id,r.submitted_by from public.bid_reviews r join public.profiles p on p.id=r.submitted_by where p.role='estimator';

create function private.default_bid_estimator() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.bid_id::text,0));
  if exists(select 1 from public.profiles where id=new.submitted_by and role='estimator') then
    insert into public.bid_estimator_assignments(bid_id,estimator_id) values(new.bid_id,new.submitted_by) on conflict(bid_id) do nothing;
  end if;
  return null;
end; $$;
revoke all on function private.default_bid_estimator() from public,anon,authenticated;
create trigger default_bid_estimator after insert or update of submitted_by on public.bid_reviews
  for each row execute function private.default_bid_estimator();
