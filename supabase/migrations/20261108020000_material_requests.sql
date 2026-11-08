create table public.material_requests (
  id uuid primary key default gen_random_uuid(),
  bid_id uuid references public.bids(id) on delete restrict,
  title text not null check (length(btrim(title)) between 1 and 200),
  quantity numeric not null default 1 check (quantity > 0 and quantity <= 1000000),
  unit text not null default 'each' check (length(btrim(unit)) between 1 and 40),
  notes text not null default '' check (length(notes) <= 4000),
  status text not null default 'requested' check (status in ('requested','ordered','delivered','cancelled')),
  expected_on date,
  ordered_at timestamptz,
  delivered_at timestamptz,
  requested_by uuid default auth.uid() references public.profiles(id) on delete set null,
  updated_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index material_requests_requester_idx on public.material_requests(requested_by);
create index material_requests_job_idx on public.material_requests(bid_id);
create index material_requests_status_idx on public.material_requests(status,created_at desc);
alter table public.material_requests enable row level security;
revoke all on public.material_requests from anon, authenticated;
grant select, insert on public.material_requests to authenticated;
grant update (bid_id,title,quantity,unit,notes,status,expected_on) on public.material_requests to authenticated;

create policy material_requests_read on public.material_requests for select to authenticated
using (requested_by = (select auth.uid()) or (select public.role_of()) in ('admin','estimator','pm'));
create policy material_requests_create on public.material_requests for insert to authenticated
with check (
  (select public.role_of()) in ('admin','estimator','pm','office','viewer','shop')
  and requested_by = (select auth.uid()) and updated_by = (select auth.uid())
  and status = 'requested' and ordered_at is null and delivered_at is null and expected_on is null
);
create policy material_requests_manage on public.material_requests for update to authenticated
using ((select public.role_of()) in ('admin','estimator','pm'))
with check ((select public.role_of()) in ('admin','estimator','pm'));

create function public.track_material_request() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if TG_OP = 'INSERT' then
    new.created_at := now();
    new.ordered_at := null;
    new.delivered_at := null;
  else
    if new.status = 'ordered' and old.status <> 'ordered' then
      new.ordered_at := coalesce(old.ordered_at, now());
      new.delivered_at := null;
    elsif new.status = 'delivered' and old.status <> 'delivered' then
      new.ordered_at := coalesce(old.ordered_at, now());
      new.delivered_at := now();
    elsif new.status = 'requested' then
      new.ordered_at := null;
      new.delivered_at := null;
      new.expected_on := null;
    end if;
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;
revoke all on function public.track_material_request() from public;
create trigger track_material_request before insert or update on public.material_requests
for each row execute function public.track_material_request();
