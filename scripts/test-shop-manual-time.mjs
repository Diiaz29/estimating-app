// Isolated database fixtures only. Pass the installed PGlite module path.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
const { PGlite } = await import(pathToFileURL(process.argv[2]).href)
const db = new PGlite()
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
await db.exec(`create role authenticated; create role anon; create schema auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table profiles(id uuid primary key, role text, email text);
create function role_of() returns text language sql stable security definer set search_path='' as $$select role from public.profiles where id=auth.uid()$$;
create table shop_workers(id uuid primary key,login_id uuid,first_name text,last_name text,active boolean);
create table bids(id uuid primary key,status text,completed_at timestamptz);
create table time_entries(id uuid primary key default gen_random_uuid(),bid_id uuid,worker text,shop_worker_id uuid,work_date date,hours numeric,note text,kind text,night boolean,created_by text);
alter table time_entries enable row level security;
grant usage on schema auth to authenticated; grant select,insert,update,delete on time_entries to authenticated;
create policy read_time on time_entries for select to authenticated using(true);
create policy insert_time on time_entries for insert to authenticated with check(role_of()<>'shop' and shop_worker_id is null);
create policy edit_time on time_entries for update to authenticated using(role_of()='admin') with check(role_of()='admin');
create policy delete_time on time_entries for delete to authenticated using(role_of()='admin');`)
for (const [n,role] of [[1,'shop'],[2,'shop'],[3,'admin'],[4,'estimator'],[5,'viewer'],[6,'office'],[7,'pm']]) await db.query('insert into profiles values($1,$2,$3)',[id(n),role,`${role}${n}@test.invalid`])
await db.query('insert into shop_workers values($1,$2,$3,$4,true),($5,$6,$7,$8,true),($9,$2,$3,$4,false)',[id(11),id(1),'Jorge','Worker',id(12),id(2),'Other','Worker',id(13)])
await db.query("insert into bids values($1,'won',null),($2,'draft',null),($3,'won',now())",[id(21),id(22),id(23)])
await db.exec(await readFile(new URL('../supabase/migrations/20261113205908_shop_manual_time.sql',import.meta.url),'utf8'))
const login = async n => db.exec(`reset role; select set_config('request.jwt.claim.sub','${n ? id(n) : ''}',false); set role authenticated;`)
const save = (overrides={}) => {
  const v={worker:id(11),job:id(21),date:'2026-11-12',hours:8,note:'  Built cabinets  ',kind:'shop',night:false,...overrides}
  return db.query('select public.log_shop_time($1,$2,$3,$4,$5,$6,$7) as id',Object.values(v))
}
let checks=0
await login(1)
for (const kind of ['shop','field','site_visit','punch_list']) {
  const result=await save({kind,night:true})
  const row=(await db.query('select * from time_entries where id=$1',[result.rows[0].id])).rows[0]
  assert.equal(row.worker,'Jorge Worker'); assert.equal(row.created_by,'shop1@test.invalid'); assert.equal(row.shop_worker_id,id(11)); assert.equal(row.kind,kind); assert.equal(row.night,true); assert.equal(row.note,'Built cabinets'); checks+=6
}
for (const invalid of [{worker:id(12)},{worker:id(13)},{worker:id(99)},{job:id(22)},{job:id(23)},{job:id(99)},{date:null},{date:'infinity'},{hours:0},{hours:-1},{hours:25},{hours:null},{hours:'NaN'},{kind:'invalid'},{kind:null},{night:null}]) {
  await assert.rejects(()=>save(invalid)); checks++
}
await assert.rejects(()=>db.query("insert into time_entries(worker) values('Spoofed')"),/row-level security/);checks++
assert.equal((await db.query("update time_entries set hours=1 returning id")).rows.length,0);checks++
assert.equal((await db.query('delete from time_entries returning id')).rows.length,0);checks++
for (const n of [0,2,3,4,5,6,7]) { await login(n); await assert.rejects(()=>save()); checks++ }
await db.exec('reset role; set role anon;')
await assert.rejects(()=>save(),/permission denied/);checks++
console.log(`Shop manual time checks passed: ${checks}. Isolated fixtures only.`)
await db.close()
