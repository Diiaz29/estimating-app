begin;
-- Transactional fixtures: nothing in this test persists.
do $test$
declare actor uuid; actor_email text; login uuid; project uuid;
  roster uuid := gen_random_uuid(); entry uuid; test_role text; rejected boolean;
begin
  select id,email into actor,actor_email from public.profiles where role='admin' limit 1;
  select id into login from public.profiles where role='shop' limit 1;
  select id into project from public.bids limit 1;
  if actor is null or login is null or project is null then raise exception 'Missing test fixtures'; end if;
  insert into public.shop_workers(id,login_id,first_name,last_name) values(roster,login,'Permission','Fixture');
  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform set_config('request.jwt.claims',json_build_object('sub',actor,'email',actor_email,'role','authenticated')::text,true);
  foreach test_role in array array['admin','estimator','pm','office','viewer','shop'] loop
    update public.profiles set role=test_role where id=actor;
    rejected := false;
    entry := gen_random_uuid();
    execute 'set local role authenticated';
    begin
      insert into public.time_entries(id,bid_id,worker,shop_worker_id,work_date,hours,kind,night,created_by)
      values(entry,project,'Permission Fixture',roster,current_date,2,'shop',true,actor_email);
    exception when insufficient_privilege then rejected := true;
    end;
    execute 'reset role';
    if rejected <> (test_role <> 'admin') then raise exception 'Incorrect insert permission for %',test_role; end if;
    if test_role='admin' and not exists(select 1 from public.time_entries where id=entry and worker='Permission Fixture' and shop_worker_id=roster and created_by=actor_email and hours=2 and night) then raise exception 'Attribution not preserved'; end if;
  end loop;
  update public.profiles set role='admin' where id=actor;
  for test_role in select unnest(array['wrong name','wrong creator','inactive']) loop
    if test_role='inactive' then update public.shop_workers set active=false where id=roster; end if;
    rejected := false;
    execute 'set local role authenticated';
    begin
      insert into public.time_entries(bid_id,worker,shop_worker_id,hours,kind,created_by)
      values(project,case when test_role='wrong name' then 'Wrong' else 'Permission Fixture' end,roster,1,'shop',case when test_role='wrong creator' then 'wrong@example.com' else actor_email end);
    exception when insufficient_privilege then rejected := true;
    end;
    execute 'reset role';
    if not rejected then raise exception 'Accepted %',test_role; end if;
  end loop;
end $test$;
rollback;
