-- Day 14: remember which eBay account each connection belongs to, so an
-- eBay account-deletion notice can be matched to the right seller.
-- Safe to run more than once.

alter table ebay_connections add column if not exists ebay_username text;
alter table ebay_connections add column if not exists ebay_eias_token text;

create index if not exists ebay_connections_username_idx on ebay_connections(ebay_username);
create index if not exists ebay_connections_eias_idx on ebay_connections(ebay_eias_token);

-- Check: this should return 2.
select count(*) as new_identity_columns
from information_schema.columns
where table_name = 'ebay_connections'
  and column_name in ('ebay_username', 'ebay_eias_token');
