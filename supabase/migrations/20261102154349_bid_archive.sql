-- Archiving is workspace metadata, not a bid status or estimate input.
-- Keeping it separate preserves review fingerprints and immutable revisions.
create table public.bid_archives (
  bid_id uuid primary key references public.bids(id) on delete cascade,
  archived_at timestamptz not null default now(),
  archived_by uuid references public.profiles(id) on delete set null default auth.uid()
);
alter table public.bid_archives enable row level security;
revoke all on public.bid_archives from anon, authenticated;
grant select, insert, delete on public.bid_archives to authenticated;
create policy "team read archives" on public.bid_archives
  for select to authenticated using (true);
create policy "bid managers archive" on public.bid_archives
  for insert to authenticated with check (
    ( (select public.can_edit()) or (select public.role_of()) = 'office' )
    and archived_by = (select auth.uid())
    and exists(select 1 from public.bids b where b.id = bid_id and b.status <> 'won')
  );
create policy "bid managers restore" on public.bid_archives
  for delete to authenticated using (
    (select public.can_edit()) or (select public.role_of()) = 'office'
  );

-- A won job must never accidentally remain tucked away in the bid archive.
create function private.check_bid_archive() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare current_status text;
begin
  select status into current_status from public.bids where id = new.bid_id for update;
  if current_status = 'won' then raise exception 'Won jobs cannot be archived. Use the Jobs page to complete them.'; end if;
  return new;
end;
$$;
revoke all on function private.check_bid_archive() from public, anon, authenticated;
create trigger check_bid_archive before insert on public.bid_archives
  for each row execute function private.check_bid_archive();

create function private.check_archived_bid_status() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.status = 'won' and exists(select 1 from public.bid_archives where bid_id = new.id) then
    raise exception 'Restore this bid before marking it Won.';
  end if;
  return new;
end;
$$;
revoke all on function private.check_archived_bid_status() from public, anon, authenticated;
create trigger check_archived_bid_status before update of status on public.bids
  for each row execute function private.check_archived_bid_status();
