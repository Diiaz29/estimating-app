// Run against an isolated PostgreSQL-compatible PGlite database, never live data.
// Usage: node scripts/test-bid-review.mjs <absolute path to @electric-sql/pglite/dist/index.js>
import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
const { PGlite } = await import(pathToFileURL(process.argv[2]).href)
const db = new PGlite()
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
await db.exec(`
create role anon; create role authenticated;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table public.profiles(id uuid primary key,email text,role text,first_name text,last_name text,signature_data text,signer_name text,signer_title text);
create function public.can_edit() returns boolean language sql stable security definer as $$ select role in ('admin','estimator') from public.profiles where id=auth.uid() $$;
create function public.is_admin() returns boolean language sql stable security definer as $$ select role='admin' from public.profiles where id=auth.uid() $$;
create table public.bids(id uuid primary key,status text,name text,notes text,adders jsonb,updated_at timestamptz default now());
create table public.areas(id uuid primary key,bid_id uuid references bids(id) on delete cascade,name text,multiplier numeric);
create table public.assemblies(id uuid primary key,name text,build_minutes numeric);
create table public.line_items(id uuid primary key,area_id uuid references areas(id) on delete cascade,assembly_id uuid references assemblies(id),quantity numeric);
create table public.materials(id uuid primary key,name text,cost numeric,cost_updated_at timestamptz,active boolean default true);
create table public.finishes(id uuid primary key,name text,cost numeric,cost_updated_at timestamptz,active boolean default true);
create table public.assembly_materials(id uuid primary key,assembly_id uuid references assemblies(id),material_id uuid references materials(id),qty numeric);
create table public.bid_finishes(bid_id uuid references bids(id) on delete cascade,finish_id uuid references finishes(id),slot text);
create table public.bid_material_overrides(bid_id uuid references bids(id) on delete cascade,from_material_id uuid,to_material_id uuid);
create table public.area_material_overrides(area_id uuid references areas(id) on delete cascade,from_material_id uuid,to_material_id uuid);
create table public.area_finish_overrides(area_id uuid references areas(id) on delete cascade,finish_id uuid,slot text);
create table public.change_orders(id uuid primary key,bid_id uuid references bids(id) on delete cascade,title text);
create table public.settings(key text primary key,value numeric);
create table public.revisions(id uuid primary key default gen_random_uuid(),bid_id uuid references bids(id) on delete cascade,rev_number integer,snapshot jsonb);
grant usage on schema auth to authenticated;
grant select,insert on public.revisions to authenticated;
insert into public.bids values('${id(10)}','working','Example bid',null,'{}',now());
insert into public.areas values('${id(11)}','${id(10)}','Break room',1);
insert into public.assemblies values('${id(12)}','Base cabinet',60);
insert into public.line_items values('${id(13)}','${id(11)}','${id(12)}',2);
insert into public.materials values('${id(14)}','Used panel',30,now(),true),('${id(15)}','Unused panel',40,now(),true);
insert into public.assembly_materials values('${id(16)}','${id(12)}','${id(14)}',1);
insert into public.settings values('price_shop_rate',60),('followup_days',7);
`)
for (const [i,role] of ['admin','estimator','viewer','pm','office','shop'].entries()) await db.query('insert into profiles(id,email,role) values($1,$2,$3)',[id(i+1),`${role}@example.test`,role])
await db.exec(await readFile(new URL('../supabase/migrations/20261028180048_bid_review_workflow.sql',import.meta.url),'utf8'))
await db.exec(await readFile(new URL('../supabase/migrations/20261029174425_preserve_review_feedback.sql',import.meta.url),'utf8'))
await db.query('insert into profiles(id,email,role) values($1,$2,$3)',[id(7),'second-estimator@example.test','estimator'])
await db.exec(await readFile(new URL('../supabase/migrations/20261029175034_bid_estimator_assignments.sql',import.meta.url),'utf8'))
await db.exec(`insert into bids values('${id(30)}','working','Legacy feedback example',null,'{}',now()); insert into revisions(id,bid_id,rev_number,snapshot) values('${id(31)}','${id(30)}',1,'{}'); insert into bid_reviews(bid_id,revision_id,stage,submitted_by,reviewed_by,reviewed_at,note,fingerprint) values('${id(30)}','${id(31)}','changes_requested','${id(2)}','${id(1)}',now(),'Previously saved review notes.','legacy');`)
await db.exec(await readFile(new URL('../supabase/migrations/20261029180545_bid_review_note_history.sql',import.meta.url),'utf8'))
await db.exec(await readFile(new URL('../supabase/migrations/20261029182932_return_review_to_estimator.sql',import.meta.url),'utf8'))
let checks = 0
const eq = (actual,expected) => { assert.deepEqual(actual,expected); checks++ }
eq((await db.query('select note,revision_number from bid_review_notes where bid_id=$1',[id(30)])).rows,[{note:'Previously saved review notes.',revision_number:1}])
await db.exec(`delete from bids where id='${id(30)}'`)
async function actor(n) { await db.exec(`reset role; select set_config('request.jwt.claim.sub','${id(n)}',false); set role authenticated;`) }
async function owner(sql) { await db.exec('reset role'); return db.exec(sql) }
async function context() { return (await db.query('select public.get_bid_review_context($1) as result',[id(10)])).rows[0].result }
async function snapshot() { return (await db.query('insert into revisions(bid_id,rev_number,snapshot) values($1,(select coalesce(max(rev_number),0)+1 from revisions where bid_id=$1),$2) returning id',[id(10),{contract:1500}])).rows[0].id }
async function action(kind,ctx,rev=ctx.review?.revision_id,note=null) { return (await db.query('select public.transition_bid_review($1,$2,$3,$4,$5,$6) as result',[id(10),kind,rev,note,ctx.review?.version??0,ctx.fingerprint])).rows[0].result }
async function denied(fn,pattern) { await assert.rejects(fn,pattern); checks++ }

await actor(2)
let ctx = await context()
const rev1 = await snapshot()
ctx = await action('submit',ctx,rev1)
eq(ctx.review.stage,'ready'); eq(ctx.review.submitted_by,id(2)); eq(ctx.review.revision_id,rev1)
eq((await db.query('select estimator_id from bid_estimator_assignments where bid_id=$1',[id(10)])).rows[0].estimator_id,id(2))
await denied(()=>db.query('select public.assign_bid_estimator($1,$2)',[id(10),id(7)]),/Only admins/)
await denied(()=>db.query('update bid_estimator_assignments set estimator_id=$1',[id(7)]),/permission denied/)
const original = (await db.query('select snapshot from revisions where id=$1',[rev1])).rows[0].snapshot
await denied(()=>action('approve',ctx),/Only admins/)
await denied(()=>db.query("update bid_reviews set stage='approved' where bid_id=$1",[id(10)]),/permission denied/)
for (const n of [3,4,5,6]) {
  await actor(n)
  eq((await db.query('select * from bid_reviews')).rows.length,0)
  eq((await db.query('select * from bid_estimator_assignments')).rows.length,0)
  await denied(()=>context(),/Only admins/)
  await denied(()=>action('submit',ctx,rev1),/Only admins/)
}
await actor(1)
ctx = await action('approve',ctx)
eq(ctx.review.stage,'approved')
await denied(()=>action('approve',ctx),/not available/)
await denied(()=>action('return',ctx,rev1,''),/Enter a note/)
await denied(()=>action('sign',ctx),/Add your signature/)
await owner(`update profiles set signature_data='TEST_SIGNATURE',signer_name='Example Admin',signer_title='Owner' where id='${id(1)}'`)
await actor(1)
const approved = ctx
ctx = await action('sign',ctx)
eq(ctx.review.stage,'signed'); eq(ctx.review.signature_data,'TEST_SIGNATURE')
await denied(()=>action('sign',approved),/review changed/)
await owner(`update materials set cost_updated_at=now() where id='${id(14)}'`)
await actor(1); eq((await context()).review.stage,'signed')
await owner(`update materials set cost=cost+1 where id='${id(15)}'; update bids set notes='Internal note' where id='${id(10)}'; update settings set value=10 where key='followup_days'`)
await actor(1); eq((await context()).review.stage,'signed')
await owner(`update materials set cost=cost+1 where id='${id(14)}'`)
await actor(1); ctx=await context(); eq(ctx.review.stage,'changes_requested'); eq(ctx.review.signature_data,null)
eq((await db.query('select snapshot from revisions where id=$1',[rev1])).rows[0].snapshot,original)
await actor(2)
const rev2 = await snapshot(); ctx=await action('submit',await context(),rev2)
await actor(1); ctx=await action('approve',ctx); ctx=await action('return',ctx,rev2,'Check the countertop dimensions.')
eq(ctx.review.note,'Check the countertop dimensions.'); eq(ctx.review.stage,'changes_requested')
eq(ctx.history.length,1); eq(ctx.history[0].note,'Check the countertop dimensions.')
eq(ctx.history[0].revision_id,rev2); eq(ctx.history[0].reviewer_name,'admin@example.test')
const firstFeedback=ctx.history[0]
await denied(()=>db.query("update bid_review_notes set note='rewrite'"),/permission denied/)
await denied(()=>db.query('delete from bid_review_notes'),/permission denied/)
await actor(3); eq((await db.query('select * from bid_review_notes')).rows.length,0)
await actor(2)
const rev3=await snapshot(); ctx=await action('submit',await context(),rev3)
eq(ctx.history,[firstFeedback]); eq(ctx.review.note,null)
await actor(1); ctx=await action('return',ctx,rev3,'Confirm the countertop and finished ends.\nKeep the original dimensions.')
eq(ctx.history.length,2); eq(ctx.history[0].revision_id,rev3); eq(ctx.history[1],firstFeedback)
await actor(2)
const nextRevision=await snapshot(); ctx=await action('submit',await context(),nextRevision)
eq(ctx.history.length,2); eq(ctx.history[1],firstFeedback)
await owner(`update line_items set quantity=3 where id='${id(13)}'`)
await actor(1); eq((await context()).review.stage,'changes_requested'); eq((await context()).history.length,2)
await denied(()=>action('approve',ctx),/review changed/)
await actor(2)
const rev4=await snapshot(); ctx=await action('submit',await context(),rev4)
await actor(1); ctx=await action('approve',ctx)
await owner("update settings set value=65 where key='price_shop_rate'")
await actor(1); eq((await context()).review.stage,'changes_requested')
await actor(2)
const rev5=await snapshot(); ctx=await action('submit',await context(),rev5)
await actor(1); ctx=await action('approve',ctx)
await snapshot(); eq((await context()).review.stage,'changes_requested')
ctx=await action('return',await context(),rev5,'Feedback on the submitted snapshot after a newer snapshot exists.')
eq(ctx.review.note,'Feedback on the submitted snapshot after a newer snapshot exists.')
await denied(()=>db.query('select public.transition_bid_review($1,$2,$3,$4,null,$5)',[id(10),'approve',rev5,null,ctx.fingerprint]),/review changed/)
// Moving a line to another bid must invalidate the old bid as well as the new.
await actor(2)
const rev6=await snapshot(); ctx=await action('submit',await context(),rev6)
await actor(1); ctx=await action('approve',ctx)
await owner(`insert into bids values('${id(20)}','working','Another example',null,'{}',now()); insert into areas values('${id(21)}','${id(20)}','Another room',1); update line_items set area_id='${id(21)}' where id='${id(13)}'`)
await actor(1); eq((await context()).review.stage,'changes_requested')
await denied(async ()=>db.query('select public.transition_bid_review($1,$2,$3,$4,$5,null)',[id(10),'submit',rev6,null,(await context()).review.version]),/Estimate inputs changed/)
// Feedback stays available after input changes or a newer snapshot, without resubmission.
ctx=await context()
eq(ctx.review.reviewed_by,null)
await actor(2); await denied(()=>action('return',ctx,rev6,'Estimator cannot return.'),/Only admins/)
await actor(1)
await denied(()=>action('return',ctx,rev6,'  '),/Enter a note/)
await denied(()=>action('return',ctx,rev5,'Wrong revision.'),/submitted revision changed/)
const beforeFeedback=ctx
ctx=await action('return',{...ctx,fingerprint:'older inputs'},rev6,'Please check the updated room dimensions.')
eq(ctx.review.note,'Please check the updated room dimensions.'); eq(ctx.review.reviewed_by,id(1))
eq(ctx.review.stage,'changes_requested'); eq(ctx.review.signature_data,null)
await denied(()=>action('return',beforeFeedback,rev6,'Stale feedback.'),/review changed/)
await denied(()=>action('approve',ctx),/submitted revision changed/)
await denied(()=>action('sign',ctx),/submitted revision changed/)
ctx=await action('return',ctx,rev6,'Additional review notes without resubmission.')
eq(ctx.review.note,'Additional review notes without resubmission.')
// Assignment does not alter estimate fingerprints, submission history, or review version.
const beforeAssignment=await context()
await db.query('select public.assign_bid_estimator($1,$2)',[id(10),id(7)])
const afterAssignment=await context()
eq(afterAssignment.review,beforeAssignment.review); eq(afterAssignment.fingerprint,beforeAssignment.fingerprint); eq(afterAssignment.history,beforeAssignment.history)
eq((await db.query('select estimator_id from bid_estimator_assignments where bid_id=$1',[id(10)])).rows[0].estimator_id,id(7))
await denied(()=>db.query('select public.assign_bid_estimator($1,$2)',[id(10),id(3)]),/Choose an admin or estimator/)
await denied(()=>db.query('select public.assign_bid_estimator($1,$2)',[id(999),id(7)]),/Bid not found/)
const adminRevision=await snapshot()
ctx=await action('submit',await context(),adminRevision)
eq(ctx.review.submitted_by,id(1))
eq((await db.query('select estimator_id from bid_estimator_assignments where bid_id=$1',[id(10)])).rows[0].estimator_id,id(7))
await db.query('select public.assign_bid_estimator($1,null)',[id(10)])
await actor(2)
const estimatorRevision=await snapshot()
await action('submit',await context(),estimatorRevision)
eq((await db.query('select estimator_id from bid_estimator_assignments where bid_id=$1',[id(10)])).rows[0].estimator_id,null)
// Changing the return recipient and storing feedback succeed or fail together.
const returnTo = (ctx,recipient,note='Please verify the latest dimensions.') => db.query('select public.return_bid_review_to_estimator($1,$2,$3,$4,$5) as result',[id(10),ctx.review.revision_id,note,ctx.review.version,recipient])
ctx=await context()
eq(ctx.estimators,[])
await denied(()=>returnTo(ctx,id(7)),/Only admins/)
await actor(1); ctx=await context()
eq(ctx.estimators.length,3)
const beforeReturn=ctx
await denied(()=>returnTo(ctx,id(3)),/Choose an admin or estimator/)
eq(await context(),beforeReturn)
await denied(()=>returnTo(ctx,null),/Choose an estimator/)
await denied(()=>returnTo(ctx,id(7),'  '),/Enter a note/)
eq(await context(),beforeReturn)
ctx=(await returnTo(ctx,id(7))).rows[0].result
eq(ctx.assigned_estimator_id,id(7)); eq(ctx.review.stage,'changes_requested')
eq(ctx.history[0].note,'Please verify the latest dimensions.')
const afterReturn=ctx
await denied(()=>returnTo(beforeReturn,id(2)),/review changed/)
eq(await context(),afterReturn)
eq((await db.query("select has_function_privilege('anon','public.return_bid_review_to_estimator(uuid,uuid,text,integer,uuid)','execute') as allowed")).rows[0].allowed,false)
eq((await db.query("select has_function_privilege('anon','public.assign_bid_estimator(uuid,uuid)','execute') as allowed")).rows[0].allowed,false)
await owner(`delete from bids where id='${id(10)}'`)
eq((await db.query('select * from bid_reviews')).rows.length,0)
eq((await db.query('select * from bid_estimator_assignments')).rows.length,0)
eq((await db.query('select * from bid_review_notes')).rows.length,0)
console.log(`Bid review database checks passed: ${checks}. Isolated fixtures only; no live database used.`)
await db.close()
