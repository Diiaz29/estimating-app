begin;
-- Run after the time permission and shared shop clock migrations.

do $test$
declare person record; fixture uuid; project uuid; affected integer;
begin
 select id into project from public.bids limit 1;
 if project is null then raise exception 'No project for permission fixture'; end if;
 for person in select id, role from public.profiles where role <> 'shop' loop
   fixture := gen_random_uuid();
   perform set_config('request.jwt.claim.sub', person.id::text, true);
   execute 'set local role authenticated';
   insert into public.time_entries(id,bid_id,worker,hours,kind) values(fixture,project,'permission test fixture',1,'shop');
   update public.time_entries set hours=2 where id=fixture;
   get diagnostics affected = row_count;
   if affected <> (case when person.role='admin' then 1 else 0 end) then raise exception 'Unexpected update access for %',person.role; end if;
   delete from public.time_entries where id=fixture;
   get diagnostics affected = row_count;
   if affected <> (case when person.role='admin' then 1 else 0 end) then raise exception 'Unexpected delete access for %',person.role; end if;
   execute 'reset role';
   delete from public.time_entries where id=fixture;
 end loop;
end $test$;
rollback;
