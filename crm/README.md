# Launch Control CRM

A work queue for a two-person team, not a record browser. Four screens: **Today** (meetings, replies to
answer with an inline reply box, follow-ups due, new website inquiries, drafted emails), **Leads** (one row
per lead with a plain-English state line and one button; untouched Lead Gen prospects stay on the Lead Gen
page until contacted), **Deals** (kanban, with Customers behind the Won column) and **Settings** (company,
email accounts, automation, history). Light theme, 16px body, nothing under 14px, 44px controls, designed for
a 50+ owner. Data lives in Supabase (`supabase/migrations/`); every table is gated on the `crm_users` allowlist.

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
