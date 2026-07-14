-- Plans / drawings attached to a bid (PDFs, photos).
create table public.plans (
  id uuid primary key default gen_random_uuid(),
  bid_id uuid not null references public.bids (id) on delete cascade,
  file_path text not null,
  note text,
  uploaded_by text,
  created_at timestamptz not null default now()
);

alter table public.plans enable row level security;
create policy "team read" on public.plans for select to authenticated using (true);
create policy "editor write" on public.plans for all to authenticated
  using (public.can_edit()) with check (public.can_edit());

insert into storage.buckets (id, name, public) values ('plans', 'plans', false)
on conflict (id) do nothing;

create policy "team plans read" on storage.objects
  for select to authenticated using (bucket_id = 'plans');
create policy "editor plans write" on storage.objects
  for insert to authenticated with check (bucket_id = 'plans' and public.can_edit());
create policy "editor plans delete" on storage.objects
  for delete to authenticated using (bucket_id = 'plans' and public.can_edit());
