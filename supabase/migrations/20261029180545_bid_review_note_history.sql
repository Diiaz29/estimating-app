-- Append-only feedback survives resubmission and automatic review invalidation.
create table public.bid_review_notes (
  bid_id uuid not null references public.bids(id) on delete cascade,
  review_version integer not null,
  revision_id uuid references public.revisions(id) on delete set null,
  revision_number integer,
  reviewer_id uuid references public.profiles(id) on delete set null,
  reviewer_name text not null,
  reviewed_at timestamptz not null,
  note text not null check (length(trim(note)) between 1 and 4000),
  primary key (bid_id, review_version)
);
alter table public.bid_review_notes enable row level security;
revoke all on public.bid_review_notes from anon, authenticated;
grant select on public.bid_review_notes to authenticated;
create policy "editors read review notes" on public.bid_review_notes
  for select to authenticated using ((select public.can_edit()));

-- Preserve the human feedback still available at deployment. Earlier cleared
-- notes cannot be reconstructed from the mutable current-review row.
insert into public.bid_review_notes(bid_id,review_version,revision_id,revision_number,reviewer_id,reviewer_name,reviewed_at,note)
  select r.bid_id,r.version,r.revision_id,v.rev_number,r.reviewed_by,
    coalesce(nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),p.email,'Team member'),r.reviewed_at,r.note
  from public.bid_reviews r left join public.profiles p on p.id=r.reviewed_by left join public.revisions v on v.id=r.revision_id
  where r.stage='changes_requested' and r.reviewed_by is not null and r.reviewed_at is not null and nullif(trim(r.note),'') is not null;

create function private.record_bid_review_note() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.stage='changes_requested' and new.reviewed_by is not null and new.reviewed_at is not null and nullif(trim(new.note),'') is not null then
    insert into public.bid_review_notes(bid_id,review_version,revision_id,revision_number,reviewer_id,reviewer_name,reviewed_at,note)
      select new.bid_id,new.version,new.revision_id,v.rev_number,new.reviewed_by,
        coalesce(nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),p.email,'Team member'),new.reviewed_at,new.note
      from public.profiles p left join public.revisions v on v.id=new.revision_id where p.id=new.reviewed_by
      on conflict(bid_id,review_version) do nothing;
  end if;
  return null;
end; $$;
revoke all on function private.record_bid_review_note() from public,anon,authenticated;
create trigger record_bid_review_note after insert or update on public.bid_reviews
  for each row execute function private.record_bid_review_note();

create or replace function private.get_bid_review_context(p_bid_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not coalesce(public.can_edit(),false) then raise exception 'Only admins and estimators may access bid reviews.' using errcode='42501'; end if;
  if not exists(select 1 from public.bids where id=p_bid_id) then raise exception 'Bid not found.' using errcode='P0002'; end if;
  return jsonb_build_object(
    'review',(select to_jsonb(r)-'fingerprint' from public.bid_reviews r where bid_id=p_bid_id),
    'fingerprint',private.bid_review_fingerprint(p_bid_id),
    'history',coalesce((select jsonb_agg(to_jsonb(n) order by n.review_version desc) from public.bid_review_notes n where n.bid_id=p_bid_id),'[]'::jsonb)
  );
end; $$;
