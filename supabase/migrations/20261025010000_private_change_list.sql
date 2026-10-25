create table public.app_change_requests (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 200),
  notes text not null default '' check (length(notes) <= 10000),
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id)
);
alter table public.app_change_requests enable row level security;
revoke all on public.app_change_requests from anon, authenticated;
grant select, insert, update on public.app_change_requests to authenticated;
-- The owner explicitly authorized these two accounts to share this list.
create policy "owner and test account change list" on public.app_change_requests
  for all to authenticated
  using ((select auth.uid()) in ('1029706b-1888-4ffa-8fe8-f77a2bfe0295'::uuid, 'd3180a9a-68cb-4286-a789-d399b486ed15'::uuid))
  with check ((select auth.uid()) in ('1029706b-1888-4ffa-8fe8-f77a2bfe0295'::uuid, 'd3180a9a-68cb-4286-a789-d399b486ed15'::uuid));
