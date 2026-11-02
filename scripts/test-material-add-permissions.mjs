// Isolated fixtures only. Usage: node scripts/test-material-add-permissions.mjs <PGlite module path>
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
const { PGlite } = await import(pathToFileURL(process.argv[2]).href)
const db = new PGlite()
await db.exec(`
create role authenticated; create schema auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table profiles(id uuid primary key,role text);
create function can_edit() returns boolean language sql stable security definer as $$select role in ('admin','estimator') from profiles where id=auth.uid()$$;
create function is_admin() returns boolean language sql stable security definer as $$select role='admin' from profiles where id=auth.uid()$$;
`)
const schema = await readFile(new URL('../supabase/migrations/0003_m2_libraries_settings.sql', import.meta.url), 'utf8')
await db.exec(schema.slice(schema.indexOf('create table public.materials'), schema.indexOf('create table public.finishes')))
await db.exec(`
alter table materials enable row level security;
grant usage on schema auth to authenticated;
grant select,insert,update,delete on materials to authenticated;
create policy "team read" on materials for select to authenticated using(true);
create policy "admin write" on materials for all to authenticated using(is_admin()) with check(is_admin());
`)
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
for (const [i, role] of ['admin','estimator','pm','viewer','office','shop'].entries()) await db.query('insert into profiles values($1,$2)',[id(i+1),role])
await db.exec(await readFile(new URL('../supabase/migrations/20261102153527_estimator_add_materials.sql',import.meta.url),'utf8'))
let checks = 0
const eq = (a,b) => { assert.deepEqual(a,b); checks++ }
const actor = n => db.exec(`reset role; select set_config('request.jwt.claim.sub','${id(n)}',false); set role authenticated;`)
await actor(2)
for (const category of ['HARDWARE','WOOD PANEL','CONSUMABLES','QUARTZ','EQUIPMENT']) {
  const row = await db.query('insert into materials(name,category,unit,cost,supplier,notes) values($1,$2,$3,$4,$5,$6) returning name,active',[`New ${category}`,category,'EACH',12.5,'Supplier','Notes'])
  eq(row.rows,[{name:`New ${category}`,active:true}])
}
eq((await db.query("update materials set cost=1 returning id")).rows.length,0)
eq((await db.query('update materials set active=false returning id')).rows.length,0)
eq((await db.query('delete from materials returning id')).rows.length,0)
await assert.rejects(() => db.query("insert into materials(name,category,unit,active) values('Inactive','HARDWARE','EACH',false)"),/row-level security/); checks++
for (const n of [3,4,5,6]) {
  await actor(n)
  await assert.rejects(() => db.query("insert into materials(name,category,unit) values('Blocked','HARDWARE','EACH')"),/row-level security/); checks++
  eq((await db.query('select count(*)::int as count from materials')).rows[0].count,5)
}
await actor(1)
eq((await db.query("insert into materials(name,category,unit) values('Admin pull','HARDWARE','EACH') returning active")).rows[0].active,true)
eq((await db.query("update materials set cost=20 where name='Admin pull' returning cost")).rows[0].cost,'20')
eq((await db.query("delete from materials where name='Admin pull' returning id")).rows.length,1)
console.log(`Material add permission checks passed: ${checks}. Isolated fixtures only.`)
await db.close()
