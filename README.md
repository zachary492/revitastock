# OmniSync (RevitaStock)

Lightweight inventory auditing SaaS for independent marketplace sellers.
Catches "ghost listings" (sold out physically, still live online) and
"phantom drops" (in stock physically, showing 0 online).

See `CLAUDE.md` for full architecture notes, conventions, and open
design questions.

## Setup

npm install
cp .env.example .env.local   # then fill in Supabase + eBay credentials
npm run dev

Visit http://localhost:3000

## Requirements

- Node.js 18.18+
- A Supabase project (free tier is fine for development)
- An eBay Developer account with a Sandbox app for OAuth testing
