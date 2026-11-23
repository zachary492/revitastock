-- Day 12: listing-quality checks.
-- Safe to run more than once.

-- 1. Allow the new problem type in the findings table.
alter table discrepancies drop constraint if exists discrepancies_type_check;
alter table discrepancies add constraint discrepancies_type_check
  check (type in (
    'ghost_listing',
    'phantom_drop',
    'quantity_mismatch',
    'sold_but_still_active',
    'ended_never_relisted',
    'stale_listing',
    'listing_quality'
  ));

-- 2. What we learned about each live listing's content (item specifics,
--    photo count, how long the description is). Not the description itself.
create table if not exists listing_details (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  item_id text not null,
  title text not null default '',
  description_length integer not null default 0,
  picture_count integer not null default 0,
  specifics jsonb not null default '[]'::jsonb,
  fetched_at timestamptz not null default now()
);

create unique index if not exists listing_details_user_item_idx
  on listing_details(user_id, item_id);

alter table listing_details enable row level security;

drop policy if exists "Users can manage their own listing details" on listing_details;
create policy "Users can manage their own listing details"
  on listing_details for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Check: this number should be 1.
select count(*) as listing_details_table
from information_schema.tables
where table_name = 'listing_details';
