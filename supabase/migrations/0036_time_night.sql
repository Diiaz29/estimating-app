-- Time entries: night-shift flag.
alter table public.time_entries add column if not exists night boolean not null default false;
