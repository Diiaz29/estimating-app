// Runs only in an isolated in-memory database; never writes to the live app.
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'
const { PGlite } = await import(pathToFileURL(process.argv[2]).href)
const db = new PGlite()
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
await db.exec(`create role anon; create role authenticated; create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table public.profiles(id uuid primary key, role text);
create table public.bids(id uuid primary key);
create function public.role_of() returns text language sql stable security definer set search_path=public as $$ select role from profiles where id=auth.uid() $$;
grant usage on schema auth to authenticated;
insert into bids values('${id(100)}');`)
for (const [i, role] of ['admin','estimator','pm','office','viewer','shop'].entries()) await db.query('insert into profiles values($1,$2)', [id(i+1),role])
await db.exec(await readFile(new URL('../supabase/migrations/20261108020000_material_requests.sql',import.meta.url),'utf8'))
async function actor(n) { await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${id(n)}'`) }
const requests=[]
for (const n of [1,2,3,4,5,6]) {
  await actor(n)
  const r=await db.query('insert into material_requests(title,bid_id,quantity,unit) values ($1,$2,3,$3) returning *',[`Item ${n}`, n%2 ? id(100) : null,'sheets'])
  requests.push(r.rows[0].id)
  assert.equal(r.rows[0].requested_by,id(n))
  await assert.rejects(db.query("insert into material_requests(title,status) values ('Spoof','ordered')"),/row-level security/)
  await assert.rejects(db.query('insert into material_requests(title,requested_by) values ($1,$2)',['Spoof',id(n===1?2:1)]),/row-level security/)
}
for(const n of [4,5,6]) {
  await actor(n)
  assert.equal((await db.query('select * from material_requests')).rows.length,1)
  assert.equal((await db.query("update material_requests set status='ordered' returning id")).rows.length,0)
  await assert.rejects(db.query('delete from material_requests'),/permission denied/)
}
for(const n of [1,2,3]) {
  await actor(n)
  assert.equal((await db.query('select * from material_requests')).rows.length,6)
  let r=(await db.query("update material_requests set status='ordered',expected_on='2026-12-01' where id=$1 returning *",[requests[3]])).rows[0]
  assert.ok(r.ordered_at); assert.equal(r.updated_by,id(n))
  r=(await db.query("update material_requests set status='delivered' where id=$1 returning *",[requests[3]])).rows[0]
  assert.ok(r.delivered_at)
  r=(await db.query("update material_requests set status='requested' where id=$1 returning *",[requests[3]])).rows[0]
  assert.equal(r.ordered_at,null); assert.equal(r.delivered_at,null); assert.equal(r.expected_on,null)
  await assert.rejects(db.query('update material_requests set requested_by=$1 where id=$2',[id(n),requests[3]]),/permission denied/)
}
await assert.rejects(db.query("insert into material_requests(title,quantity) values ('Bad quantity',0)"),/check constraint/)
await assert.rejects(db.query("insert into material_requests(title) values ('   ')"),/check constraint/)
await db.exec('reset role; set role anon')
await assert.rejects(db.query('select * from material_requests'),/permission denied/)
await db.close()
console.log('PASS: all six roles can request; managers can track orders and delivery; others see only their own requests; spoofing, invalid inputs and anonymous access rejected.')
