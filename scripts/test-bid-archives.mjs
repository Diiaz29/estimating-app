// Isolated database only. Usage: node scripts/test-bid-archives.mjs <pglite index.js>
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'
const { PGlite } = await import(pathToFileURL(process.argv[2]).href)
const db = new PGlite()
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
await db.exec(`
create role anon; create role authenticated;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table profiles(id uuid primary key, role text);
create function public.role_of() returns text language sql stable security definer as $$ select role from public.profiles where id=auth.uid() $$;
create table bids(id uuid primary key, status text, notes text, estimate jsonb, signature text);
grant usage on schema auth to authenticated;
grant select on bids to authenticated;
insert into bids values('${id(10)}','working','Keep review notes','{"amount":12345,"revision":1}','Keep signature'),('${id(11)}','won',null,'{}',null);
`)
for (const [i, role] of ['admin','estimator','office','viewer','pm','shop'].entries()) await db.query('insert into profiles values ($1,$2)', [id(i + 1), role])
await db.exec(await readFile(new URL('../supabase/migrations/20261103034000_bid_archives.sql', import.meta.url), 'utf8'))
const before = (await db.query('select * from bids order by id')).rows
async function actor(n) { await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${id(n)}'`) }
for (const n of [1,2,3]) {
  await actor(n)
  await db.query('insert into bid_archives(bid_id) values($1)', [id(10)])
  assert.equal((await db.query('select archived_by from bid_archives')).rows[0].archived_by, id(n))
  assert.deepEqual((await db.query('select * from bids order by id')).rows, before)
  await db.query('delete from bid_archives where bid_id=$1', [id(10)])
  assert.equal((await db.query('select * from bid_archives')).rows.length, 0)
}
for (const n of [4,5,6]) {
  await actor(n)
  await assert.rejects(db.query('insert into bid_archives(bid_id) values($1)', [id(10)]), /row-level security/)
}
await actor(1)
await assert.rejects(db.query('insert into bid_archives(bid_id,archived_by) values($1,$2)', [id(10),id(2)]), /row-level security/)
await assert.rejects(db.query('insert into bid_archives(bid_id) values($1)', [id(11)]), /row-level security/)
await db.query('insert into bid_archives(bid_id) values($1)', [id(10)])
await actor(4)
assert.equal((await db.query('select * from bid_archives')).rows.length, 1)
assert.equal((await db.query('delete from bid_archives returning bid_id')).rows.length, 0)
await db.exec('reset role; set role anon')
await assert.rejects(db.query('select * from bid_archives'), /permission denied/)
await db.exec('reset role')
assert.deepEqual((await db.query('select * from bids order by id')).rows, before)
await db.query('delete from bids where id=$1', [id(10)])
assert.equal((await db.query('select * from bid_archives')).rows.length, 0)
console.log('Archive/restore, data preservation, role permissions, ownership and cascade checks passed. No live records changed.')
await db.close()
