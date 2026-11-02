// Isolated PostgreSQL fixtures only; never connects to live data.
// Usage: node scripts/test-bid-archive.mjs <PGlite module path>
import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
const { PGlite } = await import(pathToFileURL(process.argv[2]).href)
const db = new PGlite()
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
await db.exec(`
create role anon; create role authenticated; create schema auth; create schema private;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table profiles(id uuid primary key,role text);
create function role_of() returns text language sql stable security definer set search_path = '' as $$select role from public.profiles where id=auth.uid()$$;
create function can_edit() returns boolean language sql stable security definer set search_path = '' as $$select public.role_of() in ('admin','estimator')$$;
create table bids(id uuid primary key,status text,name text,notes text);
alter table bids enable row level security;
grant usage on schema auth to authenticated;
grant select,update on bids to authenticated;
create policy "team read" on bids for select to authenticated using(true);
create policy "editor update" on bids for update to authenticated using(can_edit() or role_of()='office') with check(can_edit() or role_of()='office');
create table revisions(id uuid primary key,bid_id uuid references bids(id),snapshot jsonb);
create table bid_reviews(bid_id uuid primary key,stage text,note text,fingerprint text);
insert into bids values('${id(10)}','working','Example project','Retain these notes'),('${id(11)}','won','Won project',null);
insert into revisions values('${id(20)}','${id(10)}','{"contract":1500,"rooms":["Breakroom"]}');
insert into bid_reviews values('${id(10)}','ready','Keep the review','unchanged');
`)
for(const [i,role] of ['admin','estimator','office','pm','viewer','shop'].entries()) await db.query('insert into profiles values($1,$2)',[id(i+1),role])
await db.exec(await readFile(new URL('../supabase/migrations/20261102154349_bid_archive.sql',import.meta.url),'utf8'))
let checks=0
const eq=(a,b)=>{assert.deepEqual(a,b);checks++}
const denied=async(fn,pattern)=>{await assert.rejects(fn,pattern);checks++}
const actor=async(n)=>db.exec(`reset role; select set_config('request.jwt.claim.sub','${id(n)}',false); set role authenticated;`)
const invariant=async()=>{await db.exec('reset role');return (await db.query("select (select jsonb_agg(to_jsonb(b)) from bids b) bids,(select jsonb_agg(to_jsonb(r)) from revisions r) revisions,(select jsonb_agg(to_jsonb(r)) from bid_reviews r) reviews")).rows}
const before=await invariant()
for(const n of [1,2,3]) {
  await actor(n)
  eq((await db.query('insert into bid_archives(bid_id) values($1) returning archived_by',[id(10)])).rows[0].archived_by,id(n))
  await denied(()=>db.query("update bids set status='won' where id=$1",[id(10)]),/Restore this bid/)
  eq(await invariant(),before)
  await actor(n)
  eq((await db.query('delete from bid_archives where bid_id=$1 returning bid_id',[id(10)])).rows.length,1)
  await denied(()=>db.query('insert into bid_archives(bid_id) values($1)',[id(11)]),/Won jobs cannot|row-level security/)
  await denied(()=>db.query('insert into bid_archives(bid_id,archived_by) values($1,$2)',[id(10),id(6)]),/row-level security/)
}
await actor(1)
await db.query('insert into bid_archives(bid_id) values($1)',[id(10)])
for(const n of [4,5,6]) {
  await actor(n)
  eq((await db.query('select count(*)::int as count from bid_archives')).rows[0].count,1)
  eq((await db.query('delete from bid_archives returning bid_id')).rows.length,0)
  await denied(()=>db.query('insert into bid_archives(bid_id) values($1)',[id(11)]),/Won jobs cannot|row-level security|permission denied/)
  await denied(()=>db.query("update bid_archives set archived_at=now()"),/permission denied/)
}
await db.exec('reset role; set role anon;')
await denied(()=>db.query('select * from bid_archives'),/permission denied/)
await actor(1)
await db.query('delete from bid_archives where bid_id=$1',[id(10)])
eq(await invariant(),before)
await actor(2)
eq((await db.query("update bids set status='won' where id=$1 returning status",[id(10)])).rows[0].status,'won')
console.log(`Bid archive database checks passed: ${checks}. Isolated fixtures only.`)
await db.close()
