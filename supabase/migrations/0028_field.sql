-- Field tab: installer photos + time tracking, and PM-written client reports.
-- Photos and time are open to the whole team (installers sign in as viewers);
-- reports are PM/admin/estimator only.

create table public.field_photos (
  id uuid primary key default gen_random_uuid(),
  bid_id uuid not null references public.bids (id) on delete cascade,
  file_path text not null,
  note text,
  uploaded_by text,
  created_at timestamptz not null default now()
);
alter table public.field_photos enable row level security;
create policy "team full access" on public.field_photos
  for all to authenticated using (true) with check (true);

create table public.time_entries (
  id uuid primary key default gen_random_uuid(),
  bid_id uuid not null references public.bids (id) on delete cascade,
  worker text not null,
  work_date date not null default current_date,
  hours numeric not null,
  note text,
  created_by text,
  created_at timestamptz not null default now()
);
alter table public.time_entries enable row level security;
create policy "team full access" on public.time_entries
  for all to authenticated using (true) with check (true);

create table public.field_reports (
  id uuid primary key default gen_random_uuid(),
  bid_id uuid not null references public.bids (id) on delete cascade,
  report_date date not null default current_date,
  crew text,
  work_performed text not null default '',
  issues text,
  next_steps text,
  photo_ids uuid[] not null default '{}',
  created_by text,
  created_at timestamptz not null default now()
);
alter table public.field_reports enable row level security;
create policy "team read" on public.field_reports for select to authenticated using (true);
create policy "scheduler write" on public.field_reports for all to authenticated
  using (public.can_schedule()) with check (public.can_schedule());

insert into storage.buckets (id, name, public) values ('field', 'field', false)
on conflict (id) do nothing;
create policy "team field read" on storage.objects
  for select to authenticated using (bucket_id = 'field');
create policy "team field write" on storage.objects
  for insert to authenticated with check (bucket_id = 'field');
create policy "team field delete" on storage.objects
  for delete to authenticated using (bucket_id = 'field');
