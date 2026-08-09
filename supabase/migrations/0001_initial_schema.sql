-- RevitaStock initial schema
-- Run this once in the Supabase SQL Editor (Day 4 setup)

-- 1. PROFILES
-- One row per signed-up seller. Links to Supabase's built-in auth system.
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);

-- 2. PHYSICAL INVENTORY
-- Every row from a seller's uploaded CSV — "what's actually on the shelf."
create table physical_inventory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  sku text not null,
  quantity integer not null default 0,
  title text,
  location text,
  uploaded_at timestamptz not null default now()
);

create index physical_inventory_user_id_idx on physical_inventory(user_id);
create index physical_inventory_sku_idx on physical_inventory(user_id, sku);

-- 3. EBAY CONNECTIONS
-- One row per seller once they connect their eBay Sandbox/Production account.
create table ebay_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  ebay_user_id text,
  access_token text not null,
  refresh_token text not null,
  token_expires_at timestamptz,
  connected_at timestamptz not null default now()
);

create unique index ebay_connections_user_id_idx on ebay_connections(user_id);

-- 4. DISCREPANCIES
-- The core output: every ghost listing / phantom drop found during a sync.
create table discrepancies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  sku text not null,
  type text not null check (type in ('ghost_listing', 'phantom_drop', 'quantity_mismatch')),
  physical_quantity integer not null,
  live_quantity integer not null,
  listing_id text,
  resolved boolean not null default false,
  found_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index discrepancies_user_id_idx on discrepancies(user_id);

-- ============================================
-- ROW LEVEL SECURITY
-- Each seller can only ever see/edit their own rows, enforced by the
-- database itself, not just app code.
-- ============================================

alter table profiles enable row level security;
alter table physical_inventory enable row level security;
alter table ebay_connections enable row level security;
alter table discrepancies enable row level security;

create policy "Users can view their own profile"
  on profiles for select using (auth.uid() = id);

create policy "Users can update their own profile"
  on profiles for update using (auth.uid() = id);

create policy "Users can manage their own inventory"
  on physical_inventory for all using (auth.uid() = user_id);

create policy "Users can manage their own eBay connection"
  on ebay_connections for all using (auth.uid() = user_id);

create policy "Users can manage their own discrepancies"
  on discrepancies for all using (auth.uid() = user_id);
