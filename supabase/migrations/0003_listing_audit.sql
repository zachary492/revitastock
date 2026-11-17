-- Day 5: audit based on eBay listings (no CSV needed)
-- Run this once in the Supabase SQL Editor. It is safe to run twice.

-- 1. Allow the two new problem types in the findings table.
alter table discrepancies drop constraint if exists discrepancies_type_check;
alter table discrepancies add constraint discrepancies_type_check
  check (type in (
    'ghost_listing',
    'phantom_drop',
    'quantity_mismatch',
    'sold_but_still_active',
    'ended_never_relisted'
  ));

-- 2. The new problems have no shelf count, so those columns may be empty.
alter table discrepancies alter column physical_quantity drop not null;
alter table discrepancies alter column live_quantity drop not null;

-- 3. Room for plain-language details (titles, dates) used by the results page.
alter table discrepancies add column if not exists details jsonb;

-- 4. Remembers the seller's answers on the "Needs a label" page.
--    confirmed = "this old listing is the item with this label"
--    rejected  = "this is NOT the same item as the suggestion"
create table if not exists label_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  item_id text not null,
  status text not null check (status in ('confirmed', 'rejected')),
  label text,
  created_at timestamptz not null default now(),
  check ((status = 'confirmed' and label is not null) or status = 'rejected')
);

create unique index if not exists label_links_user_item_idx
  on label_links(user_id, item_id);

alter table label_links enable row level security;

drop policy if exists "Users can manage their own label links" on label_links;
create policy "Users can manage their own label links"
  on label_links for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 5. Check: both numbers below should be 1.
select
  (select count(*) from information_schema.tables
    where table_name = 'label_links') as label_links_table,
  (select count(*) from information_schema.columns
    where table_name = 'discrepancies' and column_name = 'details') as details_column;
