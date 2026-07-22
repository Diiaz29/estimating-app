-- Per-room material swaps (hardware per area). A room's pick beats the job-wide pick.
create table public.area_material_overrides (
  area_id uuid not null references public.areas (id) on delete cascade,
  from_material_id uuid not null references public.materials (id) on delete cascade,
  to_material_id uuid not null references public.materials (id) on delete cascade,
  primary key (area_id, from_material_id)
);

alter table public.area_material_overrides enable row level security;
create policy "team read" on public.area_material_overrides for select to authenticated using (true);
create policy "editor write" on public.area_material_overrides for all to authenticated
  using (public.can_edit()) with check (public.can_edit());
