# What a $10,000 CRM looks like (research, 2026-10-20)

Question: Launch Control plans to sell a tailored CRM for about $10k one-time (inside a $10k-$15k
Launch Package). What does a buyer get for that money elsewhere, what does it compete with, and
what does our CRM need to show in a demo?

Source notes. Every price below comes from a page that was opened, except where it says
**UNVERIFIED**. Pipedrive's own pricing page returned 403, so its prices are third-party search
summaries only. Web tools hit a session limit partway through. The demo-checklist sources
(SelectHub, OpenCRM, Beacon) were seen only as search results, not opened. Most agency sources sell
the service they price, so treat their ranges as what they claim.

## 1. What $5k-$25k buys from builders and implementers

| Provider type | Price | What's in it | Source |
|---|---|---|---|
| HubSpot Elite partner (INSIDEA), Pro onboarding | From $2,000 per Hub (Fast Track from $3,000), 8 weeks (4 on Fast Track) | Portal config, standard data import, properties, pipelines, dashboards, sequences/playbooks, **1 live training session**, **30 days post-launch support**, fixed scope locked at proposal. Excluded: migration, custom API integrations, data cleaning, strategy, licence. Extra training $250/session; managed ops from $2,000/mo | https://insidea.com/hubspot/implementation-cost |
| HubSpot's own required onboarding fee | $1,500 (Sales Hub Pro) | On top of seats | https://www.hubspot.com/pricing/sales |
| HubSpot partners, general | Fixed scope $5k-$50k+; "Sales Hub Pro Implementation" example at $5,000 | Fixed-fee onboarding + hourly custom work + retainer | https://www.getmonetizely.com/articles/how-do-hubspot-implementation-partners-price-their-services-in-2025 (search result only) |
| Attio partner, scoped setup | $1,000-$3,500, 1-5 days | Data model, custom objects, pipeline, views, 2-4 automations, training, short support window | https://www.craftt.io/blog/attio-implementation-cost |
| Attio partner, full migration + rebuild | $3,000-$15,000, 3-8 weeks | Full data model, legacy-CRM migration, 6+ automations, dashboards, Slack/Gmail integrations, training across teams. Typical 5-15 person team: $3k-$8k all-in | same |
| Attio partner, enterprise | $15,000-$75,000+ | SSO, advanced permissions, deep automation, custom reporting | same |
| Comparison quoted by Craftt | HubSpot implementations $6k-$30k; Salesforce $30k-$100k+ | | same |
| Clay / GTM outbound agencies | Mostly retainers: $2.5k-$10k+/mo, often 3-month minimum; demandDrive from ~$5k/mo; Growth Alliance from $10k/mo (Clay credits extra) | Enrichment, scoring, segmentation, CRM data cleanup, signal-based outbound, weekly strategy sessions | https://www.salesforge.ai/blog/clay-agencies-usa |
| Custom CRM build (Raftlabs) | Prototype from $10k; bare-bones ~$24k ("a database with a UI"); core V1 $45k-$100k, 12-20 wks | V1 = contacts+companies with custom fields, kanban pipeline, activity timeline, **two-way Gmail and Outlook sync**, reporting, **role-based access**. V2 (+$40k-$85k) = sequences, lead scoring, forms, workflow engine, calendar integrations. V3 = SSO, audit logs, API, AI lead scoring. Ongoing: 10-20% of build per year; LLM features $500-$5,000/mo | https://www.raftlabs.com/blog/crm-development-cost |
| Custom CRM build (Techvify) | Small business ~$10,000, weeks to a couple of months | Scheduling, online payments, automated SMS and email, client history (offshore rates, $20-25/hr) | https://techvify.com/custom-crm-development-cost |

**How it is sold (pattern across INSIDEA and Craftt):** a free or cheap audit first, then a
**fixed-scope, fixed-fee** build with a named timeline, a set number of training sessions, a
30-day support window, and a monthly managed-ops retainer offered after. Migration and integrations
are line items, not hidden.

**Read:** at US agency rates, $10k is under what custom builders charge for a bare-bones CRM
($24k+). Our $10k is cheap for a custom build and expensive for a SaaS setup ($2k-$8k). The pitch
has to be "custom build at an implementation price", not "a CRM setup".

## 2. What $10k competes with: SaaS seat cost over 2 years

Annual-billing prices, seats only (no add-ons, no AI credit top-ups, no implementation).

| CRM / plan | $/seat/mo (annual) | 5 seats x 24 mo | 10 seats x 24 mo | Source |
|---|---|---|---|---|
| Folk Premium (sequences, dashboards) | $48 | $5,760 | $11,520 | https://www.folk.app/pricing |
| Pipedrive Premium **UNVERIFIED** ($49-$59 per third parties) | ~$59 | ~$7,080 | ~$14,160 | https://www.activepieces.com/blog/pipedrive-pricing-plans-and-total-costs-for-2026.md (not opened) |
| Attio Pro (sequences, call intelligence, advanced reporting) | $79 ($99 monthly) | $9,480 | $18,960 | https://attio.com/pricing |
| HubSpot Sales Hub Pro | $90 ($100 monthly) + $1,500 onboarding | $12,300 | $23,100 | https://www.hubspot.com/pricing/sales |
| Close Growth (power dialer, workflows, AI summaries) | $99* | $11,880 | $23,760 | https://www.close.com/pricing |
| Salesforce Pro Suite (quoting, forecasting) | $100 | $12,000 | $24,000 | https://www.salesforce.com/sales/pricing/ |

\* Close's page shows two prices per plan without labels; the lower one is assumed to be annual.

**Read:** for a 5-person team, $10k equals about two years of a premium SaaS CRM. For a 10-person team
it is under one year. Our argument: no per-seat fees, they own it, it fits how they work. Add
partner setup ($2k-$8k) and the SaaS route costs a 5-10 person team $12k-$30k over two years.

## 3. What a buyer expects to see in a demo

Baseline, taken from the plan tables above: what's in every paid plan at the comparison price.

**Must-haves (in every $50-$100/seat plan):**
- Contacts and companies with custom fields, plus a timeline of every email, meeting and note (Raftlabs V1; folk/Attio)
- Two-way email and calendar sync (Close all plans; folk all plans; Attio all plans)
- Deal pipeline (kanban) with value, stage, close date (all)
- Email templates and **multi-step sequences that stop on reply** (HubSpot Pro, Attio Pro, folk Premium, Close Growth workflows)
- Reporting dashboards and a sales forecast (HubSpot 30 dashboards plus team forecasting; Salesforce Pro forecasting; folk Premium dashboards)
- Tasks and reminders, CSV import, data export (Attio/Craftt migration notes)
- Users, roles and permissions (Attio Plus "basic", Pro "advanced"; Raftlabs V1 includes RBAC)
- Training plus about 30 days of support after launch (INSIDEA)

**Wow features (what premium tiers sell on in 2026):**
- AI lead summaries, suggested next action, AI email rewrite (Close Growth)
- AI assistants and agents that research and run workflows (folk Assistants, Attio "Ask Attio"/agents, HubSpot Agent Builder, Salesforce Agentforce)
- Automatic enrichment that finds emails and company data (folk 500-1,000/mo, Attio enhanced/advanced, Close Chloe enrichment)
- Calling: power dialer, recording, call intelligence (Close Growth, Attio Pro)
- Lead scoring (Raftlabs V2/V3)
- Meeting scheduler / booking link (Pipedrive Growth per third-party; Raftlabs V2 calendar)
- Audit log, SSO (Raftlabs V3; Salesforce Advanced)
- Mobile app, client portal (portals: Softr/Mewayz case studies, search results only)

**Demo practice** (search-result summaries from SelectHub/OpenCRM/Beacon, not opened): buyers come
with a list of must-haves and tick them off; anything the demo skips gets read as missing. They ask
about customization, who can see what, who can import and export, reporting, and integrations
with their accounting and email tools.

## 4. Gap table: Launch Control CRM vs the $10k expectation

Read from `crm/README.md`, the admin route folders (activity, calendar, customers, dashboard, deals,
drafts, inbox, lead-gen, leads, settings, tasks), `crm/src/lib/store/types.ts`, and the migration
filenames. "Not in types" means the field is absent from the TypeScript model. It does not prove
the UI lacks it.

| Feature | Expected at $10k? | LC has it? | Notes |
|---|---|---|---|
| Leads with live statuses and saved views | Yes | **Yes, ahead** | DB sets status from events; "Needs reply / Follow-up due / Waiting on them" views beat generic list views |
| Scored prospecting / lead gen | Wow | **Yes, ahead** | 11-factor score with evidence plus outreach hook. That's Clay-agency work ($5k+/mo), built in |
| Email send/receive per lead | Yes | Yes (Outlook only) | No Gmail. Many SMB buyers are on Google Workspace |
| AI-drafted replies and follow-ups, auto-send | Wow | **Yes** | Matches Close's AI email rewrite |
| Follow-up cadence | Yes | Partial | Follow-up date + count + auto-send. Not a named multi-step sequence with per-step stats |
| Calendar with Outlook sync | Yes | Yes | |
| Deals kanban | Yes | Partial | Deal = name, value, stage, notes. No close date, probability, owner, or link to contacts |
| Forecast / reporting dashboards | **Yes** | Unclear/weak | Dashboard route exists; types have nothing a forecast could be built from |
| Contacts vs companies, custom fields | Yes | No | Lead/customer is one row with one email/phone. No multiple contacts per company, no custom fields |
| Activity timeline | Yes | Partial | Activity log covers CRUD events. Unclear if emails, meetings and notes merge into one per-record timeline |
| Tasks | Yes | Yes | No assignee |
| Users, owners, roles, permissions | **Yes** | No | `crm_users` is an email allowlist. No record owner, no roles |
| Audit log | Wow (enterprise) | Partial | Activity log has no actor field in `ActivityEntry` |
| CSV import / export | Yes | Yes / partial | leads/import; lead-gen/export only |
| Web form intake | Yes | Yes | Website inquiry becomes a lead |
| Booking link / scheduler | Wow | No | Calendar exists; no public booking page |
| AI record summary / next-best-action | Wow | Partial | `nextAction` and `statusReason` exist. No AI thread summary or ranked "do this next" |
| Enrichment of existing records | Wow | Partial | Lead-gen enriches its own prospects; no "enrich this lead" on hand-entered or imported leads |
| Calling / SMS | Wow | No | Phone stored only |
| Mobile | Yes | Unknown | Needs a phone-width check of the admin |
| Client portal | Wow | No | |
| Integrations (Slack, QuickBooks, Zapier/webhooks) | Yes | No | Outlook + Supabase only |
| Branding (company logo, tailored) | Our edge | Yes | Settings with logo; tailoring per client is the pitch |
| Training + post-launch support in scope | Yes | Not packaged | INSIDEA includes 1-2 sessions and 30 days. Put it in our scope sheet |

## 5. The 5 changes that most raise perceived value in a demo

1. **Revenue dashboard + forecast.** Add close date, probability and owner to deals. The dashboard
   shows weighted pipeline by month, win rate, speed-to-first-reply, reply rate and leads by source.
   Every competitor at this price demos a forecast. Ours has nothing to build one from yet.
2. **AI "Today" brief and lead summary.** Turn needs-attention into a ranked AI queue. Each lead
   shows a 3-line thread summary, a suggested next step and a one-click drafted action. We already
   have the parts (drafts, statusReason, awaiting). This is the wow moment Close and Attio charge
   $79-$99/seat for.
3. **Named sequences with stop-on-reply and step stats.** Promote follow-ups to multi-step
   sequences (day 0 / 3 / 7, AI-personalised from the lead-gen hook) with sent/replied per step.
   Buyers treat sequences as the line between a contact list and a sales system.
4. **Companies with multiple contacts, owners and roles.** Add a company record with N contacts,
   an owner on every lead, deal and task, and admin/member roles. Add an actor on activity entries so
   it doubles as an audit log. Buyers ask "who can see what" in every demo, and we can't answer it today.
5. **Booking link that creates the lead and the meeting.** Add a public page on the client's
   brand that writes to the Outlook calendar, creates or updates the lead, and moves status to
   "meeting". It shows the CRM working end to end, from website to calendar to pipeline, which a
   seat-based tool needs Calendly plus Zapier to do.

Packaging (no code): sell it the way partners do. Fixed scope sheet, timeline, data migration,
2 training sessions and 30-60 days support in the $10k, then the retainer. Demo on a seeded
tenant in the prospect's industry and brand (a motorsport tenant for the first client). Show the
2-year seat math from section 2.
