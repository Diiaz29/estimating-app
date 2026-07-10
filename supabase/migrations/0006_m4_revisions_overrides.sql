-- M4: revision snapshots (a sent price never drifts) and job-level material
-- swaps (e.g. prefinished ply boxes instead of white melamine on this job).

create table public.revisions (
  id uuid primary key default gen_random_uuid(),
  bid_id uuid not null references public.bids (id) on delete cascade,
  rev_number integer not null,
  note text,
  contract_amount numeric not null,
  tax numeric not null default 0,
  true_cost numeric,
  profit numeric,
  margin_pct numeric,
  snapshot jsonb not null,             -- full areas/lines/adders/settings at snapshot time
  created_by text,
  created_at timestamptz not null default now(),
  unique (bid_id, rev_number)
);

create table public.bid_material_overrides (
  bid_id uuid not null references public.bids (id) on delete cascade,
  from_material_id uuid not null references public.materials (id) on delete cascade,
  to_material_id uuid not null references public.materials (id) on delete cascade,
  primary key (bid_id, from_material_id)
);

alter table public.revisions enable row level security;
alter table public.bid_material_overrides enable row level security;

create policy "team read" on public.revisions for select to authenticated using (true);
create policy "team insert" on public.revisions for insert to authenticated with check (true);
-- no update/delete policies: revisions are history, they don't change

create policy "team full access" on public.bid_material_overrides
  for all to authenticated using (true) with check (true);

-- Admins may delete a snapshot (test runs, mistakes); estimators may not —
-- revisions are the record of what was quoted.
create policy "admin delete" on public.revisions
  for delete to authenticated using (public.is_admin());
