-- Day 9: our own copy of each seller's sold and ended listings.
-- eBay only reports the last 60 days, so we save what we see on every sync.
-- Safe to run more than once.

create table if not exists listing_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  item_id text not null,
  status text not null check (status in ('sold', 'ended_unsold')),
  sold_key text not null default '',   -- the sale time for sold items, else empty
  sku text,
  title text not null default '',
  listing_type text,
  quantity_available integer,
  quantity_sold integer not null default 0,
  price numeric,
  start_time timestamptz,
  end_time timestamptz,
  relisted boolean not null default false,
  sold_at timestamptz,
  paid boolean,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create unique index if not exists listing_history_unique_idx
  on listing_history(user_id, item_id, status, sold_key);

alter table listing_history enable row level security;

drop policy if exists "Users can manage their own listing history" on listing_history;
create policy "Users can manage their own listing history"
  on listing_history for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Check: this number should be 1.
select count(*) as listing_history_table
from information_schema.tables
where table_name = 'listing_history';
