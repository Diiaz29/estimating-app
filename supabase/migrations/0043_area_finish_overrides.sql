-- Per-room finish picks (laminate / solid surface). A room's pick for a slot
-- beats the job-wide bid_finishes assignment, same idea as hardware swaps.
create table public.area_finish_overrides (
  area_id uuid not null references public.areas (id) on delete cascade,
  slot text not null,
  finish_id uuid not null references public.finishes (id) on delete cascade,
  primary key (area_id, slot)
);

alter table public.area_finish_overrides enable row level security;
create policy "team read" on public.area_finish_overrides for select to authenticated using (true);
create policy "editor write" on public.area_finish_overrides for all to authenticated
  using (public.can_edit()) with check (public.can_edit());
