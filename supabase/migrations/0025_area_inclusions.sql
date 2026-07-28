-- Per-room inclusions/exclusions on estimate areas (shown on the proposal room blocks).
alter table public.areas add column if not exists inclusions text;
alter table public.areas add column if not exists exclusions text;
