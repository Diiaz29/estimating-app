-- Remember WHERE each sheet was calibrated, so the reference line stays visible.
alter table public.plan_scales
  add column ax numeric, add column ay numeric,
  add column bx numeric, add column by numeric,
  add column label text;
