// Isolated RLS verification only; no live data or credentials.
// Usage: node scripts/test-finish-edit-permissions.mjs <absolute PGlite module path>
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
const { PGlite } = await import(pathToFileURL(process.argv[2]).href)
const db = new PGlite()
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
await db.exec(`
create role authenticated; create schema auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table profiles(id uuid primary key,role text);
create function public.can_edit() returns boolean language sql stable security definer as $$select role in ('admin','estimator') from profiles where id=auth.uid()$$;
create function public.is_admin() returns boolean language sql stable security definer as $$select role='admin' from profiles where id=auth.uid()$$;
create table finishes(id uuid primary key,name text,brand text,color_code text,unit text,cost numeric,default_slot text,active boolean default true);
alter table finishes enable row level security;
grant usage on schema auth to authenticated;
grant select,insert,update,delete on finishes to authenticated;
create policy "team read" on finishes for select to authenticated using(true);
create policy "admin write" on finishes for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy "editor insert" on finishes for insert to authenticated with check(public.can_edit());
insert into finishes(id,name,cost,active) values('${id(10)}','Active finish',20,true),('${id(11)}','Retired finish',30,false);
`)
for(const [i,role] of ['admin','estimator','pm','viewer','office','shop'].entries()) await db.query('insert into profiles values($1,$2)',[id(i+1),role])
await db.exec(await readFile(new URL('../supabase/migrations/20261029193755_estimator_edit_finishes.sql',import.meta.url),'utf8'))
let checks=0
function eq(actual,expected) { assert.deepEqual(actual,expected); checks++ }
async function actor(n) { await db.exec(`reset role; select set_config('request.jwt.claim.sub','${id(n)}',false); set role authenticated;`) }
await actor(2)
eq((await db.query("update finishes set name='Updated laminate',brand='Example',color_code='A1',unit='SHEET',cost=42,default_slot='PLAM 1' where id=$1 returning name,cost",[id(10)])).rows,[{name:'Updated laminate',cost:'42'}])
await assert.rejects(()=>db.query('update finishes set active=false where id=$1',[id(10)]),/row-level security/); checks++
eq((await db.query("update finishes set name='Changed retired' where id=$1 returning id",[id(11)])).rows.length,0)
eq((await db.query('update finishes set active=true where id=$1 returning id',[id(11)])).rows.length,0)
eq((await db.query('delete from finishes where id=$1 returning id',[id(10)])).rows.length,0)
for(const n of [3,4,5,6]) {
  await actor(n)
  eq((await db.query("update finishes set cost=1 where id=$1 returning id",[id(10)])).rows.length,0)
  eq((await db.query('select cost from finishes where id=$1',[id(10)])).rows[0].cost,'42')
}
await actor(1)
eq((await db.query('update finishes set active=false where id=$1 returning active',[id(10)])).rows[0].active,false)
eq((await db.query('update finishes set active=true where id=$1 returning active',[id(11)])).rows[0].active,true)
eq((await db.query('delete from finishes where id=$1 returning id',[id(10)])).rows.length,1)
console.log(`Finish edit permission checks passed: ${checks}. Isolated fixtures only.`)
await db.close()
