-- Day 11: "no watchers for a long time" check.
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
    'stale_listing'
  ));

-- 2. eBay only tells us how many people are watching RIGHT NOW. So on every
--    sync we remember when we first saw each live listing and the last time
--    it had a watcher.
create table if not exists listing_watch_state (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  item_id text not null,
  first_seen_at timestamptz not null default now(),
  last_watched_at timestamptz,
  last_watch_count integer not null default 0,
  last_seen_at timestamptz not null default now()
);

create unique index if not exists listing_watch_state_user_item_idx
  on listing_watch_state(user_id, item_id);

alter table listing_watch_state enable row level security;

drop policy if exists "Users can manage their own watch state" on listing_watch_state;
create policy "Users can manage their own watch state"
  on listing_watch_state for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Check: this number should be 1.
select count(*) as watch_state_table
from information_schema.tables
where table_name = 'listing_watch_state';
