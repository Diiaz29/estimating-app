-- Receipts attached to jobs: the paper trail behind the actuals.
create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  bid_id uuid not null references public.bids (id) on delete cascade,
  file_path text not null,
  amount numeric,
  category text not null default 'materials'
    check (category in ('materials', 'delivery', 'travel', 'subs', 'other')),
  note text,
  uploaded_by text,
  created_at timestamptz not null default now()
);

alter table public.receipts enable row level security;
create policy "team full access" on public.receipts
  for all to authenticated using (true) with check (true);

-- Private storage bucket for the files
insert into storage.buckets (id, name, public) values ('receipts', 'receipts', false)
on conflict (id) do nothing;

create policy "team receipts read" on storage.objects
  for select to authenticated using (bucket_id = 'receipts');
create policy "team receipts write" on storage.objects
  for insert to authenticated with check (bucket_id = 'receipts');
create policy "team receipts delete" on storage.objects
  for delete to authenticated using (bucket_id = 'receipts');
