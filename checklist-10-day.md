# RevitaStock — 10-Day Checklist
### ~2 hours/day · picks up from: landing page draft done, video script draft 1,
### Hermes Agent live, eBay Developer Program access approved (no sandbox keys yet)

---

## Tools & accounts you'll need (set up as you go, not all on day 1)

- [ ] **Node.js** (18.18+) — installed on your new computer
- [ ] **VS Code** — installed on your new computer
- [ ] **Git** — installed (for saving code history)
- [ ] **GitHub account** — free, for backing up your code
- [ ] **Supabase account** — free tier, for your database
- [ ] **eBay Developer account** — already approved ✅, still need Sandbox keys

---

## Day 1 — Get your machine working again
- [ ] Install Node.js on the new computer (nodejs.org, LTS version)
- [ ] Install VS Code
- [ ] Install Git
- [ ] Re-download/unzip the `omnisync` project folder onto the new computer
- [ ] Open the folder in VS Code, open the terminal, run `npm install`
- [ ] Run `npm run dev` — confirm you can see the site at `localhost:3000`

**Done when:** the placeholder RevitaStock homepage loads in your browser.

---

## Day 2 — Database setup
- [ ] Create a free Supabase project (if not already done)
- [ ] Copy your Supabase URL and anon key into a new `.env.local` file
      (use `.env.example` as the template)
- [ ] Confirm the app can start with those env vars in place, no errors

**Done when:** `npm run dev` runs clean with Supabase credentials loaded.

---

## Day 3 — eBay Sandbox keys
- [ ] Log into developer.ebay.com
- [ ] Go to Application Keys, create a **Sandbox** keyset (not Production yet)
- [ ] Save the Client ID and Client Secret into `.env.local`
- [ ] Note: leave `EBAY_ENV=sandbox` — do not touch Production yet

**Done when:** your Sandbox keys exist and are saved (don't need to use them yet).

---

## Day 4 — Database schema, part 1
- [ ] With me: design the core tables (sellers, physical_inventory,
      sync_runs, discrepancies)
- [ ] Write the first Supabase migration file
- [ ] Apply it to your Supabase project, confirm tables exist in the
      Supabase dashboard

**Done when:** you can see real tables in your Supabase project's Table Editor.

---

## Day 5 — Auth (sign-up/login)
- [ ] Wire up Supabase Auth for email/password sign-up and login
- [ ] Build a basic login page and signed-in dashboard placeholder
- [ ] Test: create a real test account, log in, log out

**Done when:** you can create an account and land on a (mostly empty) dashboard.

---

## Day 6 — CSV upload, part 1
- [ ] Build the upload UI (drag-and-drop or file picker)
- [ ] Wire up CSV parsing (using `papaparse`, already in the project)
- [ ] Validate rows (SKU + quantity required) before saving

**Done when:** uploading a sample CSV shows parsed rows on screen.

---

## Day 7 — CSV upload, part 2
- [ ] Save validated rows into the `physical_inventory` table in Supabase
- [ ] Show upload errors clearly (e.g. "row 4: quantity isn't a number")
- [ ] Test with a real, slightly messy CSV (typos, blank rows) to check
      validation actually catches problems

**Done when:** a real CSV upload lands correctly in your database.

---

## Day 8 — Inventory dashboard
- [ ] Build a simple table view showing uploaded inventory
- [ ] Pull real data from Supabase (not hardcoded placeholder data)
- [ ] Basic sort/search if time allows (nice-to-have, not required)

**Done when:** logging in shows your actual uploaded inventory, live from the database.

---

## Day 9 — eBay Sandbox connection (first touch)
- [ ] With me: wire up the "Connect eBay Store" OAuth flow using your
      Sandbox keys
- [ ] Test the connect flow end-to-end against eBay's Sandbox (fake test
      listings, no real data at risk)
- [ ] Confirm you can retrieve at least one test listing back from eBay

**Done when:** clicking "Connect eBay" completes an OAuth round-trip
against Sandbox and returns something.

---

## Day 10 — Review, breathe, replan
- [ ] Test the full flow so far: sign up → upload CSV → view inventory →
      connect Sandbox eBay account
- [ ] Note what broke, what felt confusing, what needs revisiting
- [ ] With me: map out the next 10-day block (discrepancy-matching logic
      is the natural next milestone)
- [ ] Optional, if energy allows: check in on Hermes Agent's research
      output and revisit the video script with fresh eyes

**Done when:** you have a working (rough) local prototype and a clear
next block of work — not a finished product yet, and that's expected.

---

## A few ground rules for the next 10 days

- **Don't touch eBay Production keys yet.** Sandbox only, until the app
  actually works.
- **Don't feel behind if a day slips or takes longer than 2 hours.**
  This checklist assumes steady progress, not a perfect pace — what
  matters is that most days move something forward.
- **Marketing (Hermes research, video, landing page polish) is
  intentionally light this block.** The critical path right now is a
  working local prototype — that's what everything else depends on.
