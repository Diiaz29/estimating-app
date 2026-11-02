-- Explicit approval of an existing numbered revision; signing keeps its ID and number.
create or replace function private.transition_bid_review(p_bid_id uuid,p_action text,p_revision_id uuid,p_note text,p_expected_version integer,p_fingerprint text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.bid_reviews; current_fingerprint text; actor public.profiles; latest public.revisions; client_revision_id uuid;
begin
  if auth.uid() is null or not coalesce(public.can_edit(),false) then raise exception 'Only admins and estimators may submit bids.' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_bid_id::text,0));
  if not exists(select 1 from public.bids where id=p_bid_id and status in ('received','working','sent')) then raise exception 'Only an active bid can be submitted or reviewed.'; end if;
  select * into actor from public.profiles where id=auth.uid();
  select * into r from public.bid_reviews where bid_id=p_bid_id for update;
  if p_expected_version is distinct from coalesce(r.version,0) then raise exception 'This review changed. Reload its status and try again.' using errcode='40001'; end if;
  -- Feedback concerns the submitted snapshot, even when live inputs have changed.
  -- It cannot approve prices or sign; preserve version/revision checks and admin-only access.
  if p_action='return' then
    if not coalesce(public.is_admin(),false) then raise exception 'Only admins may approve, return, or sign bids.' using errcode='42501'; end if;
    if r.bid_id is null or r.revision_id is distinct from p_revision_id then raise exception 'The submitted revision changed. Reload its review status.'; end if;
    if r.stage not in ('ready','approved','signed','changes_requested') then raise exception 'This action is not available at the current review stage.'; end if;
    if nullif(trim(p_note),'') is null or length(p_note)>4000 then raise exception 'Enter a note explaining what needs to change (up to 4,000 characters).'; end if;
    update public.bid_reviews set stage='changes_requested',reviewed_by=auth.uid(),reviewed_at=now(),note=trim(p_note),signed_by=null,signed_at=null,signature_data=null,signer_name=null,signer_title=null,version=version+1,updated_at=now() where bid_id=p_bid_id;
    return private.get_bid_review_context(p_bid_id);
  end if;
  current_fingerprint := private.bid_review_fingerprint(p_bid_id);
  if p_fingerprint is distinct from current_fingerprint then raise exception 'Estimate inputs changed. Reload the saved estimate before continuing.' using errcode='40001'; end if;
  select * into latest from public.revisions where bid_id=p_bid_id and id=p_revision_id;

  -- An admin may deliberately review an existing frozen client revision, even
  -- if the working estimate has moved on. Approval is tied to this exact ID;
  -- the live fingerprint still detects edits made after this approval.
  if p_action='approve_existing' then
    if not coalesce(public.is_admin(),false) then raise exception 'Only admins may approve an existing revision.' using errcode='42501'; end if;
    if latest.id is null or latest.rev_number is null then raise exception 'Choose an existing numbered client revision.'; end if;
    if jsonb_typeof(latest.snapshot->'display') is distinct from 'object' then raise exception 'This revision does not contain a printable saved estimate.'; end if;
    if r.revision_id=latest.id and r.stage in ('approved','signed') then raise exception 'This revision is already approved or signed. Reload its status.'; end if;
    insert into public.bid_reviews(bid_id,revision_id,stage,submitted_by,fingerprint,reviewed_by,reviewed_at)
    values(p_bid_id,latest.id,'approved',auth.uid(),current_fingerprint,auth.uid(),now())
    on conflict(bid_id) do update set revision_id=excluded.revision_id,stage='approved',submitted_by=auth.uid(),submitted_at=now(),fingerprint=current_fingerprint,
      reviewed_by=auth.uid(),reviewed_at=now(),note=null,signed_by=null,signed_at=null,signature_data=null,signer_name=null,signer_title=null,version=public.bid_reviews.version+1,updated_at=now();
    return private.get_bid_review_context(p_bid_id);
  end if;

  if p_action='submit' then
    if r.stage is not null and r.stage<>'changes_requested' then raise exception 'This bid is already submitted. Reload its review status.'; end if;
    if latest.id is null or latest.id is distinct from p_revision_id or latest.review_fingerprint is distinct from current_fingerprint then raise exception 'Save a current internal review copy before submitting.'; end if;
    insert into public.bid_reviews(bid_id,revision_id,stage,submitted_by,fingerprint) values(p_bid_id,p_revision_id,'ready',auth.uid(),current_fingerprint)
    on conflict(bid_id) do update set revision_id=excluded.revision_id,stage='ready',submitted_by=auth.uid(),submitted_at=now(),fingerprint=current_fingerprint,
      reviewed_by=null,reviewed_at=null,note=null,signed_by=null,signed_at=null,signature_data=null,signer_name=null,signer_title=null,version=public.bid_reviews.version+1,updated_at=now();
  else
    if not coalesce(public.is_admin(),false) then raise exception 'Only admins may approve, return, or sign bids.' using errcode='42501'; end if;
    if r.bid_id is null or latest.id is null or r.revision_id is distinct from p_revision_id or latest.id is distinct from r.revision_id or r.fingerprint is distinct from current_fingerprint then raise exception 'The submitted estimate changed. Reload and review the new submission.'; end if;
    if p_action='approve' and r.stage='ready' then
      update public.bid_reviews set stage='approved',reviewed_by=auth.uid(),reviewed_at=now(),note=null,version=version+1,updated_at=now() where bid_id=p_bid_id;
    elsif p_action='sign' and r.stage='approved' then
      if nullif(actor.signature_data,'') is null then raise exception 'Add your signature on the Team page before signing this proposal.'; end if;
      -- Copy the approved payload verbatim. Internal review copies remain immutable
      -- and never consume a client number. The advisory lock serializes signing.
      client_revision_id := latest.id;
      if latest.rev_number is null then
        insert into public.revisions(bid_id,rev_number,note,contract_amount,tax,true_cost,profit,margin_pct,snapshot,created_by)
        select latest.bid_id,coalesce(max(v.rev_number),0)+1,latest.note,latest.contract_amount,latest.tax,
          latest.true_cost,latest.profit,latest.margin_pct,latest.snapshot,latest.created_by
        from public.revisions v where v.bid_id=p_bid_id
        returning id into client_revision_id;
      end if;
      update public.bid_reviews set revision_id=client_revision_id,stage='signed',signed_by=auth.uid(),signed_at=now(),signature_data=actor.signature_data,signer_name=actor.signer_name,signer_title=actor.signer_title,version=version+1,updated_at=now() where bid_id=p_bid_id;
    else raise exception 'This action is not available at the current review stage.';
    end if;
  end if;
  return private.get_bid_review_context(p_bid_id);
end; $$;

create or replace function private.get_bid_review_context(p_bid_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not coalesce(public.can_edit(),false) then raise exception 'Only admins and estimators may access bid reviews.' using errcode='42501'; end if;
  if not exists(select 1 from public.bids where id=p_bid_id) then raise exception 'Bid not found.' using errcode='P0002'; end if;
  return jsonb_build_object(
    'review',(select to_jsonb(r)-'fingerprint' from public.bid_reviews r where bid_id=p_bid_id),
    'fingerprint',private.bid_review_fingerprint(p_bid_id),
    'internal_review_submissions',true,
    'approve_existing_revision',true,
    'assigned_estimator_id',(select estimator_id from public.bid_estimator_assignments where bid_id=p_bid_id),
    'estimators',case when public.is_admin() then coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',coalesce(nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),p.email)) order by p.first_name,p.last_name,p.email) from public.profiles p where p.role in ('admin','estimator')),'[]'::jsonb) else '[]'::jsonb end,
    'history',coalesce((select jsonb_agg(to_jsonb(n) order by n.review_version desc) from public.bid_review_notes n where n.bid_id=p_bid_id),'[]'::jsonb)
  );
end; $$;
