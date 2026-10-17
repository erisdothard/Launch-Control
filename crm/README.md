# Launch Control CRM

The Hyper Racer admin CRM rebuilt for Launch Control: Dashboard, Leads, Lead Gen (scored
prospects from `tools/leadgen`), Customers, Deals, Tasks, Activity Log, Settings. Data lives in
Supabase (`supabase/migrations/`); every table is gated on the `crm_users` email allowlist.

Brand matches the marketing site (`web/`): tokens in `src/styles/tokens.css` mirror
`web/src/styles/tokens.css`, the Grid Box mark and livery stripe are in
`src/components/brand/BrandMark.tsx`, fonts are Sora / Michroma / Chivo Mono.

Add a teammate: `insert into public.crm_users (email) values ('name@example.com');`

## Setup

```bash
pnpm install   # or npm install
cp .env.example .env.local   # fill in a Supabase project's URL + anon key
pnpm dev
```
