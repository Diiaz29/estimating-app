-- Return feedback and set its recipient in one transaction. A rejected recipient
-- or stale review rolls back both the note/history and the assignment.
create function private.return_bid_review_to_estimator(p_bid_id uuid,p_revision_id uuid,p_note text,p_expected_version integer,p_estimator_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not coalesce(public.is_admin(),false) then raise exception 'Only admins may return bids to an estimator.' using errcode='42501'; end if;
  if p_estimator_id is null then raise exception 'Choose an estimator to receive these notes.' using errcode='22023'; end if;
  perform private.transition_bid_review(p_bid_id,'return',p_revision_id,p_note,p_expected_version,null);
  perform private.assign_bid_estimator(p_bid_id,p_estimator_id);
  return private.get_bid_review_context(p_bid_id);
end; $$;
revoke all on function private.return_bid_review_to_estimator(uuid,uuid,text,integer,uuid) from public,anon;
grant execute on function private.return_bid_review_to_estimator(uuid,uuid,text,integer,uuid) to authenticated;
create function public.return_bid_review_to_estimator(p_bid_id uuid,p_revision_id uuid,p_note text,p_expected_version integer,p_estimator_id uuid) returns jsonb
language sql security invoker set search_path='' as $$ select private.return_bid_review_to_estimator(p_bid_id,p_revision_id,p_note,p_expected_version,p_estimator_id); $$;
revoke all on function public.return_bid_review_to_estimator(uuid,uuid,text,integer,uuid) from public,anon;
grant execute on function public.return_bid_review_to_estimator(uuid,uuid,text,integer,uuid) to authenticated;

create or replace function private.get_bid_review_context(p_bid_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not coalesce(public.can_edit(),false) then raise exception 'Only admins and estimators may access bid reviews.' using errcode='42501'; end if;
  if not exists(select 1 from public.bids where id=p_bid_id) then raise exception 'Bid not found.' using errcode='P0002'; end if;
  return jsonb_build_object(
    'review',(select to_jsonb(r)-'fingerprint' from public.bid_reviews r where bid_id=p_bid_id),
    'fingerprint',private.bid_review_fingerprint(p_bid_id),
    'assigned_estimator_id',(select estimator_id from public.bid_estimator_assignments where bid_id=p_bid_id),
    'estimators',case when public.is_admin() then coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',coalesce(nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),p.email)) order by p.first_name,p.last_name,p.email) from public.profiles p where p.role in ('admin','estimator')),'[]'::jsonb) else '[]'::jsonb end,
    'history',coalesce((select jsonb_agg(to_jsonb(n) order by n.review_version desc) from public.bid_review_notes n where n.bid_id=p_bid_id),'[]'::jsonb)
  );
end; $$;
