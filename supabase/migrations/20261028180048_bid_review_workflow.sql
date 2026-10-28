-- Review status is independent of the bid's sales status. Existing revisions
-- remain immutable; a submission always references a newly locked revision.
create table public.bid_reviews (
  bid_id uuid primary key references public.bids(id) on delete cascade,
  revision_id uuid references public.revisions(id) on delete set null,
  stage text not null check (stage in ('ready','approved','changes_requested','signed')),
  submitted_by uuid not null references public.profiles(id),
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  note text,
  fingerprint text not null,
  version integer not null default 1,
  signed_by uuid references public.profiles(id),
  signed_at timestamptz,
  signature_data text,
  signer_name text,
  signer_title text,
  updated_at timestamptz not null default now()
);
alter table public.bid_reviews enable row level security;
grant select on public.bid_reviews to authenticated;
revoke insert, update, delete on public.bid_reviews from anon, authenticated;
create policy "editors read bid reviews" on public.bid_reviews for select to authenticated using ((select public.can_edit()));
create index bid_reviews_attention on public.bid_reviews(stage, submitted_at);

create schema if not exists private;
-- Fingerprint only job inputs and libraries actually used by this job. Checking
-- freshness, changing an unrelated material, and editing time logs do not reset approval.
create function private.bid_review_fingerprint(p_bid_id uuid) returns text
language sql stable security definer set search_path = '' as $$
with job_areas as (select * from public.areas where bid_id=p_bid_id),
job_lines as (select l.* from public.line_items l join job_areas a on a.id=l.area_id),
used_assemblies as (select distinct assembly_id as id from job_lines where assembly_id is not null),
used_materials as (
  select material_id as id from public.assembly_materials where assembly_id in (select id from used_assemblies)
  union select from_material_id from public.bid_material_overrides where bid_id=p_bid_id
  union select to_material_id from public.bid_material_overrides where bid_id=p_bid_id
  union select from_material_id from public.area_material_overrides where area_id in (select id from job_areas)
  union select to_material_id from public.area_material_overrides where area_id in (select id from job_areas)
), used_finishes as (
  select finish_id as id from public.bid_finishes where bid_id=p_bid_id
  union select finish_id from public.area_finish_overrides where area_id in (select id from job_areas)
)
select md5(jsonb_build_object(
  'bid',(select to_jsonb(b)-array['created_at','updated_at','status','due_at','bid_value','notes','lost_reason','sent_at','followup_days','completed_at'] from public.bids b where id=p_bid_id),
  'areas',(select jsonb_agg(to_jsonb(a)-'created_at' order by id) from job_areas a),
  'lines',(select jsonb_agg(to_jsonb(l)-'created_at' order by id) from job_lines l),
  'finishes',(select jsonb_agg(to_jsonb(f) order by finish_id,slot) from public.bid_finishes f where bid_id=p_bid_id),
  'overrides',(select jsonb_agg(to_jsonb(o) order by from_material_id) from public.bid_material_overrides o where bid_id=p_bid_id),
  'area_overrides',(select jsonb_agg(to_jsonb(o) order by area_id,from_material_id) from public.area_material_overrides o where area_id in (select id from job_areas)),
  'area_finishes',(select jsonb_agg(to_jsonb(o) order by area_id,slot) from public.area_finish_overrides o where area_id in (select id from job_areas)),
  'change_orders',(select jsonb_agg(to_jsonb(c)-array['created_at','created_by','approved_at'] order by id) from public.change_orders c where bid_id=p_bid_id),
  'assemblies',(select jsonb_agg(to_jsonb(a)-array['created_at','updated_at'] order by id) from public.assemblies a where id in (select id from used_assemblies)),
  'bom',(select jsonb_agg(to_jsonb(m)-'created_at' order by id) from public.assembly_materials m where assembly_id in (select id from used_assemblies)),
  'material_prices',(select jsonb_agg(to_jsonb(m)-array['created_at','updated_at','cost_updated_at'] order by id) from public.materials m where id in (select id from used_materials)),
  'finish_prices',(select jsonb_agg(to_jsonb(f)-array['created_at','updated_at','cost_updated_at'] order by id) from public.finishes f where id in (select id from used_finishes)),
  'settings',(select jsonb_agg(jsonb_build_array(key,value) order by key) from public.settings where key in (
    'material_markup','sub_markup','price_shop_rate','cost_shop_rate','cost_labor_share','install_rate','fuel_price_per_mile','fuel_cost_per_mile',
    'delivery_distance_threshold','delivery_rate_in_town','delivery_rate_out_of_town','equipment_kicker','equipment_kicker_threshold_lf',
    'design_hours_per_lf','punch_pct','per_diem_rate','per_diem_distance_threshold','per_diem_workday_hours','hotel_rate','gc_pct_cost','gc_pct_price','insurance_pct','tax_rate'))
)::text);
$$;
revoke all on function private.bid_review_fingerprint(uuid) from public, anon, authenticated;

alter table public.revisions add column review_fingerprint text;
create function private.stamp_revision_review_fingerprint() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.bid_id::text,0));
  new.review_fingerprint := private.bid_review_fingerprint(new.bid_id);
  return new;
end; $$;
revoke all on function private.stamp_revision_review_fingerprint() from public, anon, authenticated;
create trigger revision_review_fingerprint before insert on public.revisions for each row execute function private.stamp_revision_review_fingerprint();

-- Row triggers use the affected bid; statement triggers on shared pricing inputs
-- check existing active submissions. Only an actual fingerprint change resets it.
create function private.invalidate_bid_reviews() returns trigger
language plpgsql security definer set search_path = '' as $$
declare target_bid uuid; previous_bid uuid; row_data jsonb; previous_data jsonb; r record;
begin
  if tg_level='ROW' then
    row_data := case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
    if tg_table_name='bids' then target_bid := (row_data->>'id')::uuid;
    elsif row_data ? 'bid_id' then target_bid := (row_data->>'bid_id')::uuid;
    else select bid_id into target_bid from public.areas where id=(row_data->>'area_id')::uuid;
    end if;
    if tg_op='UPDATE' then
      previous_data := to_jsonb(old);
      if tg_table_name='bids' then previous_bid := (previous_data->>'id')::uuid;
      elsif previous_data ? 'bid_id' then previous_bid := (previous_data->>'bid_id')::uuid;
      else select bid_id into previous_bid from public.areas where id=(previous_data->>'area_id')::uuid;
      end if;
    end if;
  end if;
  for r in select bid_id from public.bid_reviews where stage in ('ready','approved','signed') and (target_bid is null or bid_id=target_bid or bid_id=previous_bid) order by bid_id loop
    perform pg_advisory_xact_lock(hashtextextended(r.bid_id::text,0));
    update public.bid_reviews br set stage='changes_requested',
      note='Estimate inputs changed. Check the saved estimate and submit a new revision for review.',
      reviewed_by=null, reviewed_at=null, signed_by=null, signed_at=null, signature_data=null, signer_name=null, signer_title=null,
      version=version+1, updated_at=now()
      where br.bid_id=r.bid_id and br.stage in ('ready','approved','signed') and (
        br.fingerprint is distinct from private.bid_review_fingerprint(r.bid_id)
        or br.revision_id is distinct from (select id from public.revisions where bid_id=r.bid_id order by rev_number desc limit 1)
      );
  end loop;
  return null;
end; $$;
revoke all on function private.invalidate_bid_reviews() from public, anon, authenticated;
do $$ declare t text; begin
  foreach t in array array['bids','areas','line_items','bid_finishes','bid_material_overrides','area_material_overrides','area_finish_overrides','change_orders','revisions'] loop
    execute format('create trigger invalidate_bid_review after insert or update or delete on public.%I for each row execute function private.invalidate_bid_reviews()',t);
  end loop;
  foreach t in array array['materials','finishes','assemblies','assembly_materials','settings'] loop
    execute format('create trigger invalidate_bid_review after insert or update or delete on public.%I for each statement execute function private.invalidate_bid_reviews()',t);
  end loop;
end $$;

create function private.get_bid_review_context(p_bid_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not coalesce(public.can_edit(),false) then raise exception 'Only admins and estimators may access bid reviews.' using errcode='42501'; end if;
  if not exists(select 1 from public.bids where id=p_bid_id) then raise exception 'Bid not found.' using errcode='P0002'; end if;
  return jsonb_build_object('review',(select to_jsonb(r)-'fingerprint' from public.bid_reviews r where bid_id=p_bid_id), 'fingerprint',private.bid_review_fingerprint(p_bid_id));
end; $$;
revoke all on function private.get_bid_review_context(uuid) from public,anon;
grant execute on function private.get_bid_review_context(uuid) to authenticated;

create function private.transition_bid_review(p_bid_id uuid,p_action text,p_revision_id uuid,p_note text,p_expected_version integer,p_fingerprint text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.bid_reviews; current_fingerprint text; actor public.profiles; latest public.revisions;
begin
  if auth.uid() is null or not coalesce(public.can_edit(),false) then raise exception 'Only admins and estimators may submit bids.' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_bid_id::text,0));
  if not exists(select 1 from public.bids where id=p_bid_id and status in ('received','working','sent')) then raise exception 'Only an active bid can be submitted or reviewed.'; end if;
  select * into actor from public.profiles where id=auth.uid();
  select * into r from public.bid_reviews where bid_id=p_bid_id for update;
  if p_expected_version is distinct from coalesce(r.version,0) then raise exception 'This review changed. Reload its status and try again.' using errcode='40001'; end if;
  current_fingerprint := private.bid_review_fingerprint(p_bid_id);
  if p_fingerprint is distinct from current_fingerprint then raise exception 'Estimate inputs changed. Reload the saved estimate before continuing.' using errcode='40001'; end if;
  select * into latest from public.revisions where bid_id=p_bid_id order by rev_number desc limit 1;

  if p_action='submit' then
    if r.stage is not null and r.stage<>'changes_requested' then raise exception 'This bid is already submitted. Reload its review status.'; end if;
    if latest.id is null or latest.id is distinct from p_revision_id or latest.review_fingerprint is distinct from current_fingerprint then raise exception 'Create a new locked revision of the saved estimate before submitting.'; end if;
    insert into public.bid_reviews(bid_id,revision_id,stage,submitted_by,fingerprint) values(p_bid_id,p_revision_id,'ready',auth.uid(),current_fingerprint)
    on conflict(bid_id) do update set revision_id=excluded.revision_id,stage='ready',submitted_by=auth.uid(),submitted_at=now(),fingerprint=current_fingerprint,
      reviewed_by=null,reviewed_at=null,note=null,signed_by=null,signed_at=null,signature_data=null,signer_name=null,signer_title=null,version=public.bid_reviews.version+1,updated_at=now();
  else
    if not coalesce(public.is_admin(),false) then raise exception 'Only admins may approve, return, or sign bids.' using errcode='42501'; end if;
    if r.bid_id is null or r.revision_id is distinct from p_revision_id or latest.id is distinct from r.revision_id or r.fingerprint is distinct from current_fingerprint then raise exception 'The submitted revision changed. Reload and review the new revision.'; end if;
    if p_action='approve' and r.stage='ready' then
      update public.bid_reviews set stage='approved',reviewed_by=auth.uid(),reviewed_at=now(),note=null,version=version+1,updated_at=now() where bid_id=p_bid_id;
    elsif p_action='return' and r.stage in ('ready','approved','signed') then
      if nullif(trim(p_note),'') is null or length(p_note)>4000 then raise exception 'Enter a note explaining what needs to change (up to 4,000 characters).'; end if;
      update public.bid_reviews set stage='changes_requested',reviewed_by=auth.uid(),reviewed_at=now(),note=trim(p_note),signed_by=null,signed_at=null,signature_data=null,signer_name=null,signer_title=null,version=version+1,updated_at=now() where bid_id=p_bid_id;
    elsif p_action='sign' and r.stage='approved' then
      if nullif(actor.signature_data,'') is null then raise exception 'Add your signature on the Team page before signing this proposal.'; end if;
      update public.bid_reviews set stage='signed',signed_by=auth.uid(),signed_at=now(),signature_data=actor.signature_data,signer_name=actor.signer_name,signer_title=actor.signer_title,version=version+1,updated_at=now() where bid_id=p_bid_id;
    else raise exception 'This action is not available at the current review stage.';
    end if;
  end if;
  return private.get_bid_review_context(p_bid_id);
end; $$;
revoke all on function private.transition_bid_review(uuid,text,uuid,text,integer,text) from public,anon;
grant usage on schema private to authenticated;
grant execute on function private.transition_bid_review(uuid,text,uuid,text,integer,text) to authenticated;

create function public.get_bid_review_context(p_bid_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.get_bid_review_context(p_bid_id); $$;
create function public.transition_bid_review(p_bid_id uuid,p_action text,p_revision_id uuid,p_note text,p_expected_version integer,p_fingerprint text) returns jsonb language sql security invoker set search_path='' as $$ select private.transition_bid_review(p_bid_id,p_action,p_revision_id,p_note,p_expected_version,p_fingerprint); $$;
revoke all on function public.get_bid_review_context(uuid) from public,anon;
revoke all on function public.transition_bid_review(uuid,text,uuid,text,integer,text) from public,anon;
grant execute on function public.get_bid_review_context(uuid) to authenticated;
grant execute on function public.transition_bid_review(uuid,text,uuid,text,integer,text) to authenticated;
