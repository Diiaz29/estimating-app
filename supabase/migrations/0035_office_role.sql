-- Office role: sets up bids/jobs and handles receipts, but doesn't touch
-- estimates, libraries, settings, or profit pages.
alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('admin', 'estimator', 'pm', 'viewer', 'office'));

-- office can create and edit bids (no delete) and attach GCs
create policy "office bids insert" on public.bids
  for insert to authenticated with check (public.role_of() = 'office');
create policy "office bids update" on public.bids
  for update to authenticated using (public.role_of() = 'office') with check (public.role_of() = 'office');
create policy "office bid_customers write" on public.bid_customers
  for all to authenticated using (public.role_of() = 'office') with check (public.role_of() = 'office');

-- receipts + job hour actuals are office work
create policy "office job_actuals write" on public.job_actuals
  for all to authenticated using (public.role_of() = 'office') with check (public.role_of() = 'office');
