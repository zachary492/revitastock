-- Day 10: remember when each seller was last synced automatically.
-- Safe to run more than once.

alter table ebay_connections
  add column if not exists last_sync_at timestamptz,
  add column if not exists last_sync_status text,
  add column if not exists last_sync_message text;

-- Check: this number should be 3.
select count(*) as sync_columns
from information_schema.columns
where table_name = 'ebay_connections'
  and column_name in ('last_sync_at', 'last_sync_status', 'last_sync_message');
