-- Keep administrator feedback available after input-change invalidation.
create or replace function private.transition_bid_review(p_bid_id uuid,p_action text,p_revision_id uuid,p_note text,p_expected_version integer,p_fingerprint text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.bid_reviews; current_fingerprint text; actor public.profiles; latest public.revisions;
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
    elsif p_action='sign' and r.stage='approved' then
      if nullif(actor.signature_data,'') is null then raise exception 'Add your signature on the Team page before signing this proposal.'; end if;
      update public.bid_reviews set stage='signed',signed_by=auth.uid(),signed_at=now(),signature_data=actor.signature_data,signer_name=actor.signer_name,signer_title=actor.signer_title,version=version+1,updated_at=now() where bid_id=p_bid_id;
    else raise exception 'This action is not available at the current review stage.';
    end if;
  end if;
  return private.get_bid_review_context(p_bid_id);
end; $$;
