-- M1: Bid tracker + contractors
-- Tables: customers, contacts, bids, bid_customers
-- Security: row-level security on everything; only signed-in team members can read/write.

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  company text not null,
  type text not null default 'GC' check (type in ('GC', 'direct', 'architect')),
  phone text,
  email text,
  address text,
  notes text,
  created_at timestamptz not null default now()
);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  name text not null,
  role text,
  phone text,
  email text,
  created_at timestamptz not null default now()
);

create table public.bids (
  id uuid primary key default gen_random_uuid(),
  job_number text not null unique,
  name text not null,
  status text not null default 'received'
    check (status in ('received', 'takeoff', 'pricing', 'sent', 'won', 'lost')),
  due_at timestamptz,
  address text,
  distance_miles numeric,
  labor_heads integer,
  install_heads integer,
  tax_exempt boolean not null default false,
  bid_value numeric,          -- rough tracking value until the estimator (M3) computes real numbers
  inclusions text,
  exclusions text,
  notes text,
  lost_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.bid_customers (
  bid_id uuid not null references public.bids (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  won_through boolean not null default false,
  primary key (bid_id, customer_id)
);

-- Keep updated_at current on every edit
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger bids_updated_at before update on public.bids
  for each row execute function public.set_updated_at();

-- Row-level security: signed-in team members only, full access.
-- (Finer roles — admin vs estimator — come later, when there's something to hide.)
alter table public.customers enable row level security;
alter table public.contacts enable row level security;
alter table public.bids enable row level security;
alter table public.bid_customers enable row level security;

create policy "team full access" on public.customers
  for all to authenticated using (true) with check (true);
create policy "team full access" on public.contacts
  for all to authenticated using (true) with check (true);
create policy "team full access" on public.bids
  for all to authenticated using (true) with check (true);
create policy "team full access" on public.bid_customers
  for all to authenticated using (true) with check (true);
