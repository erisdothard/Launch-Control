# CRM v2 conventions (branch `crm-v2`, 2026-10-21)

Read this whole file before writing code. Five builders work in this tree at the same time;
the ownership table is the contract.

## What we're building

Max Hartmann (BD partner, 50+) runs Launch Control from this CRM. It is also the demo we sell
for about $10k per client, so every screen has to look like a $10k product and work for someone
over 50. The approved design is the Today mock:
`/Users/erisdothard/Launch-Control/docs/review/crm-refs-2026-10-20/mock/today.html` (open it,
read its CSS) and the research in `docs/review/crm-refs-2026-10-20/*.md`.

Eris's asks, verbatim intent:
1. The mock's design, carried into the real CRM (Today screen + every other page).
2. Max needs a FULL inbox. Drafts live inside the Inbox ("all one thing"); no separate Drafts page.
3. Mass compose email "in every aspect that means".
4. Max's email signature laid out like his Gmail one: logo | divider | MAXWELL HARTMANN /
   BUSINESS DEVELOPMENT / 646-942-0682 / maxwell@golaunchcontrol.com / Launch Control.
   Max is the only sender; From name stays "Launch Control". Do not touch logins.

## Design rules (from the mock; tokens in `src/styles/tokens.css`, classes in `src/app/globals.css`)

- Surfaces: `--color-bg-sidebar` < `--color-bg-primary` (page) < `--color-bg-card` < `--color-bg-secondary` (wells, inputs).
  Use `.card` (12px radius) and `.well` (10px). No borders around cards; separation by surface tone.
  Rows inside lists separate with a 1px `--color-border` line.
- Type: Sora for everything you read, minimum 14px, body 15-16px, secondary `--color-text-muted`,
  labels `--color-text-dim`. Michroma (`font-display`) only for a person's/company's name on a
  record hero, the wordmark, and buttons. Chivo Mono (`font-mono`) only for clock times and
  keyboard hints. Money uses Sora with `.tabular`, never mono.
- Page title: `<AdminHeader title subtitle actions>` (stripe + 44px silver h1 + plain-English lede).
  The subtitle is a sentence that tells Max what to do, not a count dump.
- Buttons: `.btn .btn-primary` (yellow) for the ONE main action on a screen; `.btn .btn-secondary`
  for the rest; `.btn-sm` in dense rows; `.btn-quiet` for text links. Inputs: `.field`.
- Color only means something: `--color-hot` waiting on us / overdue, `--color-warm` due today,
  `--color-success` won / up, yellow = act now. Livery orange/red only as small marks (stripe,
  left rail of a hero card, row bars). No KPI tile grids, no donut charts.
- Hierarchy: one hero object per screen, then a clean list. Generous spacing, aligned columns,
  avatars top-aligned with the name. Hover/focus states on everything clickable.
- Motion: opacity/transform only, 150-220ms, `--ease-out-expo`; respect reduced motion (global rule exists).
- Phones: every page works at 390px wide with no horizontal scroll. Bottom nav exists already.
- Copy: plain sentences, no jargon, no exclamation marks, numbers as words in ledes ("Four people").

## Shared code (owned by the lead; do not edit, ask in your report if you need a change)

- `src/styles/tokens.css`, `src/app/globals.css`, `src/app/layout.tsx`, `src/app/(admin)/layout.tsx`
- `src/components/admin/AdminSidebar.tsx`, `AdminShell.tsx`, `AdminBottomNav.tsx`, `AdminHeader.tsx`
- `src/lib/supabase/types.ts` (regenerate only via the lead)
- `supabase/migrations/20261021000001_full_inbox_campaigns.sql` (ALREADY APPLIED to the live DB). It added:
  `email_messages.{folder, conversation_id, from_name, cc_address, attachments, campaign_id}`, nullable `lead_id`,
  view `email_threads`, `email_accounts.signature_phone`, tables `email_templates`, `email_campaigns`,
  `campaign_recipients`, `email_suppressions`, private storage bucket `email-attachments`.
  If you truly need more schema, write a NEW migration file named `20261021000X_<you>.sql`, keep it
  additive, and say so in your report. Do not apply it; the lead applies migrations.
- `src/components/ui/useUndoableSend.tsx`: holds a send 5s with an Undo toast. Use it for every
  single-email send button (Today, Inbox, lead thread).
- `src/lib/email/send.ts` `sendEmail(OutboundEmail)`: the one send function. The Inbox builder
  owns its implementation; everyone else only calls it.

## Ownership

| Builder | Owns (create/edit freely) |
|---|---|
| A Today | `src/app/(admin)/admin/dashboard/**`, `src/components/today/**`, `src/lib/store/today.ts`, `src/components/admin/NeedsAttention.tsx`, `ProspectInsights.tsx` |
| B Inbox | `src/app/(admin)/admin/inbox/**`, `src/app/(admin)/admin/drafts/**`, `src/components/inbox/**`, `src/lib/store/messages.ts`, `src/lib/store/drafts.ts`, `src/lib/email/send.ts`, `outlook.ts`, `gmail.ts`, `text.ts`, `src/app/(admin)/admin/leads/[id]/MessagesPanel.tsx`, `src/app/api/email/**`, `src/app/api/inbox/**`, `tools/leadgen/leadgen/outlook_sync.py`, `gmail_sync.py`, `automation.py` (+ their tests) |
| C Mass email | `src/app/(admin)/admin/compose/**`, `src/app/(admin)/admin/campaigns/**`, `src/components/compose/**`, `src/lib/store/campaigns.ts`, `src/lib/store/templates.ts`, `src/lib/email/merge.ts`, `src/app/api/automation/send-campaigns/**`, `src/app/(admin)/admin/leads/page.tsx` + any leads-list client component it renders (not `leads/[id]`), `src/components/admin/ContactFilterChips.tsx`, `tools/leadgen/leadgen/campaigns.py`, `worker.py` |
| D Records | `src/app/(admin)/admin/leads/[id]/**` except MessagesPanel.tsx, `deals/**`, `customers/**`, `src/components/admin/StatusBadge.tsx`, `LocalDate.tsx`, `LocalTime.tsx`, `src/lib/store/deals.ts`, `customers.ts`, `leads.ts` |
| E Settings & rest | `src/lib/email/signature.ts`, `src/app/(admin)/admin/settings/**`, `calendar/**`, `tasks/**`, `activity/**`, `lead-gen/**`, `update-password/**`, `src/app/login/**`, `src/lib/store/company.ts`, `calendar.ts`, `tasks.ts`, `activity.ts`, `leadgen.ts` |

If you need a small change in someone else's file, don't make it: put it in your report.

## Safety: this is Max's LIVE data (Supabase project qpvqfbpibrqxuuwtkqdf)

- NEVER send an email, create/delete/update a lead, deal, draft, campaign or any row while building.
  No test sends at all. The lead does the end-to-end send test at the end, to Eris's own address.
- Never use real client data in screenshots you save into the repo.
- Port 3101 is the CRM dev server (already running; don't start another, never touch 3000/3100).
- Node 22: prefix commands with `fnm exec --using=22`.

## Verifying your work

- `fnm exec --using=22 pnpm -s typecheck` and `pnpm -s lint` must pass for your files.
- Look at every screen you change in Python Playwright at 1440x900 and 390x844, logged in:
  1. `cp /private/tmp/claude-501/-Users-erisdothard-Launch-Control/c5438ffb-add3-4772-ac32-158e65cba4fe/scratchpad/session.mjs /Users/erisdothard/Launch-Control/crm/.lc-session-<you>.mjs`
  2. `cd /Users/erisdothard/Launch-Control/crm && fnm exec --using=22 node .lc-session-<you>.mjs > /tmp/<you>-tokens.json; rm .lc-session-<you>.mjs`
  3. In Playwright: goto `http://localhost:3101/admin/update-password#access_token=<a>&refresh_token=<r>`, wait 3s, then browse.
  Read the screenshots yourself and compare against the mock. Fix what looks off before reporting.
  Save shots under `/private/tmp/claude-501/-Users-erisdothard-Launch-Control/c5438ffb-add3-4772-ac32-158e65cba4fe/scratchpad/v2/<you>/`.
- Match the surrounding code: comment density, naming, server actions pattern (`actions.ts` with
  `"use server"`), store modules (`src/lib/store/*`, `getStoreClient`), no `console.log`.
- Do not commit. The lead commits.
