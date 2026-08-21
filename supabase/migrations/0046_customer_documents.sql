-- Company-wide paperwork per contractor (tax exemption certificates, COIs,
-- master agreements) — lives on the contractor, not on any one job.
create table public.customer_documents (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  file_path text not null,
  uploaded_by text,
  created_at timestamptz not null default now()
);

alter table public.customer_documents enable row level security;
create policy "team read" on public.customer_documents for select to authenticated using (true);
-- office files this paperwork; estimators and admins too
create policy "bid managers write" on public.customer_documents for all to authenticated
  using (public.role_of() in ('admin', 'estimator', 'office'))
  with check (public.role_of() in ('admin', 'estimator', 'office'));

insert into storage.buckets (id, name, public) values ('customer-docs', 'customer-docs', false)
on conflict (id) do nothing;

create policy "team customer docs read" on storage.objects
  for select to authenticated using (bucket_id = 'customer-docs');
create policy "bid managers customer docs write" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'customer-docs' and public.role_of() in ('admin', 'estimator', 'office'));
create policy "bid managers customer docs delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'customer-docs' and public.role_of() in ('admin', 'estimator', 'office'));

notify pgrst, 'reload schema';
