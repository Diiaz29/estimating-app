-- Shop vs field time: same table, tagged by where the hours happened.
alter table public.time_entries add column if not exists kind text not null default 'field'
  check (kind in ('field', 'shop'));
