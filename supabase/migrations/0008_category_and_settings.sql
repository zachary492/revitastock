-- Day 13: listing category, description text, and per-seller check settings.
-- Safe to run more than once.

-- 1. What the listing details table now also remembers.
alter table listing_details add column if not exists category_id text;
alter table listing_details add column if not exists category_name text;
alter table listing_details add column if not exists description_text text;

-- 2. Each seller's choices: which checks are off, and words their
--    descriptions must contain.
create table if not exists seller_settings (
  user_id uuid primary key references profiles(id) on delete cascade,
  disabled_checks text[] not null default '{}',
  required_phrases text[] not null default '{}',
  updated_at timestamptz not null default now()
);

alter table seller_settings enable row level security;

drop policy if exists "Users can manage their own settings" on seller_settings;
create policy "Users can manage their own settings"
  on seller_settings for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Check: this number should be 1, and the second should be 3.
select
  (select count(*) from information_schema.tables where table_name = 'seller_settings') as seller_settings_table,
  (select count(*) from information_schema.columns
    where table_name = 'listing_details'
      and column_name in ('category_id','category_name','description_text')) as new_detail_columns;
