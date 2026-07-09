-- M3: Estimate builder — areas, line items, per-job finish slot assignments,
-- and per-bid adder toggles. Estimating is core estimator work, so unlike the
-- libraries these are writable by the whole signed-in team.

create table public.areas (
  id uuid primary key default gen_random_uuid(),
  bid_id uuid not null references public.bids (id) on delete cascade,
  name text not null,
  sheet_ref text,                       -- "SHEET NUMBER/ELEVATION" from the count sheet
  multiplier numeric not null default 1, -- "typical of ×N"
  is_alternate boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.line_items (
  id uuid primary key default gen_random_uuid(),
  area_id uuid not null references public.areas (id) on delete cascade,
  kind text not null default 'assembly' check (kind in ('assembly', 'manual', 'sub')),
  assembly_id uuid references public.assemblies (id) on delete restrict,
  name text,                            -- manual and sub lines
  quantity numeric not null default 1,  -- always in the assembly's pricing unit (boxes or LF)
  entry_mode text not null default 'unit' check (entry_mode in ('unit', 'feet')),
  entry_value numeric,                  -- what was actually typed (feet, when entry_mode='feet')
  unit_price numeric,                   -- manual: price per unit · sub: quoted cost per unit (marked up in pricing)
  unit_cost numeric,                    -- manual only: optional true cost per unit (defaults to price)
  rate_override numeric,                -- assembly lines: replaces the computed unit price
  note text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  check (
    (kind = 'assembly' and assembly_id is not null)
    or (kind <> 'assembly' and name is not null)
  )
);

create table public.bid_finishes (
  bid_id uuid not null references public.bids (id) on delete cascade,
  slot text not null,                   -- CABINET_LAM, PLAM 1..4, SS 1..4, BOX
  finish_id uuid not null references public.finishes (id) on delete restrict,
  primary key (bid_id, slot)
);

-- Per-bid adder toggles (plan §5: each togglable per bid)
alter table public.bids add column adders jsonb not null default
  '{"install": true, "delivery": true, "design": true, "punch": true, "per_diem": true, "lodging": true, "general_conditions": true, "insurance": true}';

alter table public.areas enable row level security;
alter table public.line_items enable row level security;
alter table public.bid_finishes enable row level security;

create policy "team full access" on public.areas
  for all to authenticated using (true) with check (true);
create policy "team full access" on public.line_items
  for all to authenticated using (true) with check (true);
create policy "team full access" on public.bid_finishes
  for all to authenticated using (true) with check (true);
