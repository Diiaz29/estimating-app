// Isolated database: never touches live data.
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'
const { PGlite } = await import(pathToFileURL(process.argv[2]).href)
const db = new PGlite()
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
await db.exec(`create role anon; create role authenticated; create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table public.profiles(id uuid primary key, role text);
create function public.role_of() returns text language sql stable security definer set search_path=public as $$ select role from profiles where id=auth.uid() $$;
grant usage on schema auth to authenticated;`)
for (const [i, role] of ['admin','estimator','pm','office','viewer','shop'].entries()) await db.query('insert into profiles values($1,$2)', [id(i+1),role])
await db.exec(await readFile(new URL('../supabase/migrations/20261108052749_shop_inventory.sql',import.meta.url),'utf8'))
async function actor(n) { await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${id(n)}'`) }
let stockId
for (const n of [1,2,3]) {
  await actor(n)
  const row = (await db.query("insert into shop_inventory(title,unit,on_hand,minimum) values ('Glue','gal',3,10) returning *")).rows[0]
  stockId = row.id
  assert.equal(row.checked_by,id(n)); assert.ok(row.checked_at)
  const updated = (await db.query('update shop_inventory set on_hand=5 where id=$1 and updated_at=$2 returning *',[row.id,row.updated_at])).rows[0]
  assert.equal(Number(updated.on_hand),5)
  assert.equal((await db.query('update shop_inventory set on_hand=2 where id=$1 and updated_at=$2 returning *',[row.id,row.updated_at])).rows.length,0)
  await assert.rejects(db.query('update shop_inventory set checked_by=$1',[id(4)]),/permission denied/)
  await assert.rejects(db.query("insert into shop_inventory(title,on_hand) values ('Bad',-1)"),/check constraint/)
  await assert.rejects(db.query("insert into shop_inventory(title,minimum) values ('Bad',-1)"),/check constraint/)
  await assert.rejects(db.query("insert into shop_inventory(title,unit) values ('Bad','unknown')"),/check constraint/)
}
for (const n of [4,5,6]) {
  await actor(n)
  assert.equal((await db.query('select * from shop_inventory')).rows.length,3)
  await assert.rejects(db.query("insert into shop_inventory(title) values ('Unauthorized')"),/row-level security/)
  assert.equal((await db.query('update shop_inventory set on_hand=99 where id=$1 returning id',[stockId])).rows.length,0)
  await assert.rejects(db.query('delete from shop_inventory'),/permission denied/)
}
await db.exec('reset role; set role anon')
await assert.rejects(db.query('select * from shop_inventory'),/permission denied/)
await db.close()
console.log('PASS: inventory reads, manager writes, count attribution, stale write protection, quantity validation and anonymous denial.')
