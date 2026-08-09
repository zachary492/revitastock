# CLAUDE.md

Guidance for Claude Code (and any Claude instance) working in this repository.

## Project Overview

**RevitaStock** (originally OmniSync/Omnistock) is a lightweight,
high-performance inventory auditing SaaS for independent marketplace
sellers. It eliminates **inventory data drift** between a seller's
physical stock and their live marketplace listings.

### The Problem
- **Ghost Listings** — physical inventory is at 0, but the marketplace
  listing is still active, causing canceled orders and seller penalties.
- **Phantom Drops** — physical inventory is on the shelf, but the online
  listing shows 0, causing silent lost revenue.

### The Solution
A dashboard where a seller can:
1. Upload physical inventory as a CSV.
2. Connect their eBay store via OAuth 2.0.
3. Run an automated cross-reference between the database and live eBay
   listings, producing a clean list of quantity discrepancies.
4. Push corrected quantities back to eBay with one click.

### Target Audience
One-off item resellers — used auto parts sellers, thrift/vintage
flippers. No restock; when it's gone, it's gone, so drift is especially
costly for this seller archetype.

## Tech Stack

| Layer            | Choice                                      |
|-------------------|----------------------------------------------|
| Frontend          | Next.js (App Router) + TypeScript            |
| Styling           | Tailwind CSS                                  |
| Database/Backend  | Supabase (PostgreSQL, Auth, Storage, Edge Fns)|
| Marketplace API   | eBay REST APIs (Inventory API, Sell API)      |
| Auth to eBay      | OAuth 2.0 (eBay user token flow)              |

## Directory Structure

```
src/
  app/
    (dashboard)/dashboard, inventory, discrepancies, settings
    api/ebay/oauth/callback, ebay/sync, inventory/upload, discrepancies/resolve
    auth/
  components/ui, dashboard, inventory, discrepancies
  lib/ebay, supabase, csv, matching
  types/
  hooks/
supabase/migrations, functions
tests/unit, integration
marketing/          # landing page, video script — not part of the app build
docs/
```

Business logic (matching/reconciliation, eBay payload shaping, CSV
validation) lives in `src/lib/`, not in route handlers or components.

## Build & Development Commands

```bash
npm install
npm run dev
npm run typecheck
npm run lint
npm run test
npm run build && npm run start

supabase start
supabase db diff
supabase db push
```

## Core Domain Concepts

- **Physical Inventory Record**: a row from the seller's uploaded CSV.
- **Live Listing**: current eBay state, fetched at sync time.
- **Discrepancy**: `ghost_listing` (physical=0, live>0), `phantom_drop`
  (physical>0, live=0), or `quantity_mismatch` otherwise.
- **Sync Run**: an audit-logged cross-reference event.

## Development Guidelines

- TypeScript strict mode, no unexplained `any`.
- Server Components by default; `"use client"` only where needed.
- All eBay calls go through `src/lib/ebay/` — nowhere else.
- OAuth refresh tokens stored server-side only, never exposed to client.
- Every "push update to eBay" action is idempotent and logs before/after
  quantity.
- CSV validated fully before any database write — no partial writes.
- Row Level Security on every table containing seller data.
- Schema changes go through `supabase/migrations/`, not the dashboard.
- Reconciliation logic in `src/lib/matching/` needs unit tests: ghost
  listings, phantom drops, exact matches, SKU-only-in-one-system cases.
- Mock the eBay API in tests — never hit live Sandbox/API in CI.
- Never log OAuth tokens or credential-bearing request/response bodies.

## Open Questions

- Manual sync only, or scheduled via Supabase Edge Functions?
- Multi-user/team access — out of scope for v1 unless specified.

## Item Matching: Linking a Physical Inventory Row to a Live eBay Listing

**Decision (resolves the earlier "SKU matching" open question):** many
one-off sellers (the primary target audience) don't use eBay's optional
Custom Label/SKU field, so SKU-only matching would exclude a meaningful
share of the target audience. Pure automatic description/title matching
was considered and rejected as the sole mechanism — fuzzy text matching
risks false matches between similarly-worded but different items (e.g.
"1998 Honda Civic Alternator" vs "1999 Honda Civic Alternator"), which
is unacceptable in a product whose core value is trustworthy discrepancy
detection. A false match could tell a seller to cancel a real sale.

**Approach:**
- If a seller's CSV SKU matches eBay's Custom Label field, link
  automatically (fast path for sellers already using SKUs).
- Otherwise, after connecting eBay, the seller does a one-time manual
  match: pick the correct live listing (from their own real listings,
  not free text) for each physical inventory row.
- Title/description similarity can power a "suggested match" assist
  during that step, but the seller always confirms — it's a suggestion
  engine, not an automated ground truth.
- No schema change needed — `physical_inventory.title` already exists
  to support this.
- Not required for Day 6 (CSV upload) itself, but matters for the
  matching/discrepancy-detection logic once eBay integration is built
  (~Day 9+).

**Enhancement — eBay Item ID as the permanent key + auto-SKU write-back:**
Every eBay listing has a permanent, eBay-assigned Item ID (distinct from
the optional seller-set Custom Label/SKU). This is what the manual-match
step actually links to under the hood — it's the most reliable ID
available, since eBay guarantees it's unique and unchanging.

Since RevitaStock already needs eBay API *write* access for the
"push fix back to eBay" feature, the same access lets us close the loop
on the SKU gap: the first time a seller manually matches a shelf item to
a listing, RevitaStock can write a real SKU back onto that listing's
Custom Label field on eBay itself. From then on, that item has a real
SKU — not just inside RevitaStock, but on eBay — so future CSV uploads
match it automatically. Net effect: sellers who never had an SKU system
end up with one, as a side benefit, without extra manual work after the
first match. Not new complexity — this reuses write access already
planned for the resolve/push-fix feature.

## Planned Feature: Order & Return-Aware Discrepancy Detection (post-V1)

V1 only compares CSV physical count vs. live eBay listing quantity
(ghost listing / phantom drop / quantity mismatch). A richer version,
planned for after the initial working product, cross-references against:

- **Sold orders** (eBay Fulfillment/Order API) — explains a phantom drop
  as "likely sold, not yet restocked" instead of a bare mismatch.
- ~~**Returns** (eBay Post-Order/Returns API)~~ — **deprioritized for V1,
  not fully ruled out.** Investigated: eBay auto-relists an item by
  default when a seller issues a refund for a return, unless the seller
  has explicitly turned that off. This covers the "seller forgot to
  relist" case, so a general returns-tracking feature would mostly
  duplicate something eBay already handles by default.

  **However**, a distinct and real edge case remains: eBay's auto-relist
  doesn't know *why* an item was returned. If it comes back damaged or
  otherwise unsellable, eBay still auto-relists it — creating a fresh
  ghost listing at exactly the moment a seller would reasonably assume
  "it's back, it's handled." This is arguably a *more* valuable catch
  than a generic returns feature, since it's counterintuitive to the
  seller. Parked here as a specific future feature (not a full
  Returns-API integration) to revisit if demand surfaces post-launch —
  not worth the added complexity for V1.
- **Ended-but-not-relisted listings** — items that ended on eBay without
  selling and were never relisted, a distinct case from an active
  ghost/phantom mismatch. Generally available via eBay's Sell/Trading
  APIs by checking listing status (ended vs. active), not just current
  live listings.

This is a natural **higher-tier subscription feature** — it requires
additional API scopes/calls per sync and gives sellers a materially
richer answer ("why," not just "what"), fitting a premium tier rather
than the base offering.

Sequencing: ship V1 (CSV vs. live listing) first — this alone solves the
core pain and fits the initial timeline. Layer in sold-orders context
next, then returns (the messiest of the three, given inconsistent
return-status timing on eBay's side).

## Handling Low-Volume Sellers Without a CSV

For sellers with very few one-off items, requiring a CSV upload may be
too much friction. Worth considering for a later iteration:
- A simple manual add-item form (SKU, quantity, title) as an alternative
  to CSV upload for small inventories.
- Not a V1 requirement — CSV is the only intake path for now — but noted
  here so it isn't forgotten as a UX gap for the smallest sellers.

## Someday / Not Now — Ideas Parked Outside RevitaStock's Scope

Separate from RevitaStock's build. Logged here so a good idea doesn't
get lost, without letting it compete for focus/time until RevitaStock
itself is shipped.

- **Product/supplier sourcing agent** — a separate AI agent (explored
  with Hermes Agent + Gemini) to identify high sell-through-rate
  products in specific categories and match them to suppliers by
  quality metrics. Motivation: personal difficulty finding good
  product/supplier combinations as an eBay seller. Potential long-term
  paths if it works: (1) personal eBay sourcing tool, (2) a paid
  info-product, (3) a bonus/upsell offered to RevitaStock subscribers.
  Deliberately not a current priority — RevitaStock has a real deadline
  (Oct 16) and is the primary focus. Revisit only after RevitaStock
  ships.
