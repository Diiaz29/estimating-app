// Isolated RLS checks; never connects to production.
// Usage: node scripts/test-library-management.mjs <PGlite module path>
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
const { PGlite } = await import(pathToFileURL(process.argv[2]).href)
const db = new PGlite()
const tables = ['materials','finishes','assemblies','assembly_materials']
await db.exec(`create role authenticated; create schema auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table profiles(id uuid primary key,role text);
create function can_edit() returns boolean language sql stable security definer set search_path='' as $$select role in ('admin','estimator') from public.profiles where id=auth.uid()$$;
create function is_admin() returns boolean language sql stable security definer set search_path='' as $$select role='admin' from public.profiles where id=auth.uid()$$;
grant usage on schema auth to authenticated;`)
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
for (const [i,role] of ['admin','estimator','pm','viewer','office','shop'].entries()) await db.query('insert into profiles values($1,$2)',[id(i+1),role])
for (const table of tables) await db.exec(`create table ${table}(id int primary key,name text,active boolean default true); alter table ${table} enable row level security; grant select,insert,update,delete on ${table} to authenticated; create policy "team read" on ${table} for select to authenticated using(true); create policy "admin write" on ${table} for all to authenticated using(is_admin()) with check(is_admin()); insert into ${table} values(1,'Existing',true);`)
await db.exec(await readFile(new URL('../supabase/migrations/20261112135252_estimator_library_management.sql',import.meta.url),'utf8'))
let checks=0
const eq=(a,b)=>{assert.deepEqual(a,b);checks++}
for (const n of [1,2,3,4,5,6]) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub','${id(n)}',false); set role authenticated;`)
  for (const table of tables) {
    eq((await db.query(`select count(*)::int as count from ${table}`)).rows[0].count,1)
    if (n<=2) {
      eq((await db.query(`insert into ${table} values(2,'New',true) returning id`)).rows[0].id,2)
      eq((await db.query(`update ${table} set name='Edited',active=false where id=2 returning active`)).rows[0].active,false)
      eq((await db.query(`update ${table} set active=true where id=2 returning active`)).rows[0].active,true)
      eq((await db.query(`delete from ${table} where id=2 returning id`)).rows[0].id,2)
    } else {
      await assert.rejects(()=>db.query(`insert into ${table} values(2,'Blocked',true)`),/row-level security/);checks++
      eq((await db.query(`update ${table} set name='Blocked' where id=1 returning id`)).rows.length,0)
      eq((await db.query(`delete from ${table} where id=1 returning id`)).rows.length,0)
    }
  }
}
console.log(`Library management checks passed: ${checks}. Isolated fixtures only.`)
await db.close()
