-- Roles: admin (everything) vs estimator (create/edit, no deleting bids or contractors).
-- Every login gets a profile row automatically; new users start as estimators.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  role text not null default 'estimator' check (role in ('admin', 'estimator')),
  created_at timestamptz not null default now()
);

-- Auto-create a profile whenever a user is added in Supabase Auth
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Profiles for users that already exist (created before this migration)
insert into public.profiles (id, email)
select id, email from auth.users
on conflict (id) do nothing;

-- The first account (Brandon) is the admin
update public.profiles set role = 'admin' where email = 'bdiaz@zaidmillwork.com';

-- Helper: is the signed-in user an admin?
create or replace function public.is_admin()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- Profiles: everyone signed in can see the team; only admins can change roles.
alter table public.profiles enable row level security;
create policy "team can view profiles" on public.profiles
  for select to authenticated using (true);
create policy "admins update profiles" on public.profiles
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Tighten the M1 tables: replace blanket policies with granular ones.
-- Everyone signed in can view/create/edit; deleting bids and contractors is admin-only.
-- (Removing a person from a company and un-tagging a GC from a bid stay open to
--  everyone — those are routine edits, easily redone.)

drop policy "team full access" on public.customers;
create policy "team read" on public.customers for select to authenticated using (true);
create policy "team insert" on public.customers for insert to authenticated with check (true);
create policy "team update" on public.customers for update to authenticated using (true) with check (true);
create policy "admin delete" on public.customers for delete to authenticated using (public.is_admin());

drop policy "team full access" on public.bids;
create policy "team read" on public.bids for select to authenticated using (true);
create policy "team insert" on public.bids for insert to authenticated with check (true);
create policy "team update" on public.bids for update to authenticated using (true) with check (true);
create policy "admin delete" on public.bids for delete to authenticated using (public.is_admin());

-- contacts and bid_customers keep full team access (routine edits)
