-- Same storage machinery, two shelves: drawings ('plan') vs signed paperwork ('document').
alter table public.plans add column if not exists kind text not null default 'plan'
  check (kind in ('plan', 'document'));
