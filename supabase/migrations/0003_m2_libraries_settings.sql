-- M2: Libraries (materials, finishes, assemblies + BOM) and settings.
-- Reads: any signed-in team member (the pricing engine needs them).
-- Writes: admins only ("the estimator's judgment stays in charge; the app does the arithmetic" —
-- and the arithmetic's inputs are guarded).

create table public.materials (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  name text not null unique,
  unit text not null,
  cost numeric,
  supplier text,
  notes text,
  active boolean not null default true,
  cost_updated_at timestamptz not null default now(),  -- staleness clock: only moves when cost changes
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.finishes (
  id uuid primary key default gen_random_uuid(),
  type text not null,                 -- 'Laminate' | 'Solid surface' (free text, more later)
  name text not null unique,
  brand text,
  color_code text,
  grade text,
  unit text not null,                 -- 'SQ/FT' | 'SHEET'
  cost numeric,
  supplier text,
  default_slot text,                  -- CABINET_LAM, PLAM 1..4, SS 1..4 — suggested job-slot
  active boolean not null default true,
  cost_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.assemblies (
  id uuid primary key default gen_random_uuid(),
  category text not null,             -- Base Cabinets / Wall Cabinets / Tall Cabinets / Countertops / ...
  name text not null,
  description text,
  pricing_unit text not null check (pricing_unit in ('EA', 'LF')),
  build_minutes numeric not null default 0,    -- per pricing unit (per box for EA, per foot for LF)
  install_minutes numeric not null default 0,
  typical_width_in numeric,           -- EA only: converts feet-style takeoff entry to boxes
  width_confirmed boolean not null default false,  -- proposed defaults until Brandon confirms each
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (category, name)
);

create table public.assembly_materials (
  id uuid primary key default gen_random_uuid(),
  assembly_id uuid not null references public.assemblies (id) on delete cascade,
  material_id uuid references public.materials (id) on delete restrict,
  slot text,                          -- finish slot token instead of a concrete material
  label text,                         -- the BOM's display name for this row
  qty numeric not null,               -- per pricing unit
  waste_pct numeric not null default 0,
  created_at timestamptz not null default now(),
  check ((material_id is null) <> (slot is null))  -- exactly one of material / slot
);

create table public.settings (
  key text primary key,
  label text not null,
  group_name text not null,
  value numeric not null,
  format text not null default 'number' check (format in ('number', 'money', 'percent', 'factor', 'days', 'miles', 'lf')),
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);

-- keep updated_at fresh; move the staleness clock only when cost actually changes
create or replace function public.set_library_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  if new.cost is distinct from old.cost then
    new.cost_updated_at = now();
  end if;
  return new;
end $$;

create trigger materials_updated_at before update on public.materials
  for each row execute function public.set_library_updated_at();
create trigger finishes_updated_at before update on public.finishes
  for each row execute function public.set_library_updated_at();
create trigger assemblies_updated_at before update on public.assemblies
  for each row execute function public.set_updated_at();

create or replace function public.set_settings_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;
create trigger settings_updated_at before update on public.settings
  for each row execute function public.set_settings_updated_at();

-- RLS: read = signed-in team, write = admins
alter table public.materials enable row level security;
alter table public.finishes enable row level security;
alter table public.assemblies enable row level security;
alter table public.assembly_materials enable row level security;
alter table public.settings enable row level security;

create policy "team read" on public.materials for select to authenticated using (true);
create policy "admin write" on public.materials for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "team read" on public.finishes for select to authenticated using (true);
create policy "admin write" on public.finishes for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "team read" on public.assemblies for select to authenticated using (true);
create policy "admin write" on public.assemblies for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "team read" on public.assembly_materials for select to authenticated using (true);
create policy "admin write" on public.assembly_materials for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "team read" on public.settings for select to authenticated using (true);
create policy "admin write" on public.settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
