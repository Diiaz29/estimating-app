-- Office can manage shared calendar events, without widening other schedule permissions.
alter policy "scheduler calendar insert" on public.calendar_events
  with check ((public.can_schedule() or public.role_of() = 'office') and created_by = auth.uid());
alter policy "scheduler calendar update" on public.calendar_events
  using (public.can_schedule() or public.role_of() = 'office')
  with check (public.can_schedule() or public.role_of() = 'office');
