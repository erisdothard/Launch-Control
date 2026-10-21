# Premium CRM reference study (2026-10-20)

Purpose: give the Launch Control CRM redesign real product evidence. Every observation below comes from
screenshots captured 2026-10-20 (Python Playwright, headless Chromium, `--disable-gpu --disable-webgl`) or
page text pulled from the same pages. Screenshots are marketing-page renders of the product UI, so they show
the product as each vendor wants it seen, with demo data. No site blocked headless capture. WebSearch hit a
session limit partway through, so the function notes rely on page copy and screenshots rather than docs.

Files: `products/<product>-N.png`, contact sheet `products-sheet.png`.

---

## Attio (attio.com, attio.com/changelog)
Shots: attio-1 (list + email composer), attio-2 (deal kanban), attio-3 (list + agent cards), attio-4 (app home, AI chat, terminal agent, call recording).

**Visual**
- Light theme. Pure-white panels on a #f6f6f7-ish ground, 1px hairline borders, no drop shadows on cards inside the app; the only shadows are on floating panels (composer, popovers).
- Inter-like grotesk, about 14px body, regular weight for data, medium for titles. No bold anywhere in tables.
- Color is almost entirely neutral. Color appears only as: stage dots (orange Discovery, blue Demo, purple Proposal, green Negotiation), owner avatar initials circles, the green ICP-score pill (98, 96, 91), and a single blue primary button ("Send email").
- Table (attio-1): checkbox column, company favicon + underlined company name (link), each column header has an icon (ICP score has a sparkle icon to signal an AI attribute), row height about 36px, no zebra striping, gridlines on both axes, very faint.
- Kanban (attio-2): column header = colored dot + stage name + count chip + "+". Card = 5 icon-led rows (deal name underlined, close date, USD amount, owner with avatar, next step / note in grey placeholder "Set Next step...") and a footer row of 3 icons (notes, tasks, comments) plus an age stamp "12d" with clock icon. Cards are white with 1px border on a grey column well.
- App home (attio-4): sidebar with workspace switcher, "Quick Actions ⌘K" button, then Home / Notifications / Tasks / Notes / Calls / Reports / Automations / Sequences / Workflows, then Favorites, then Records. Main pane is a chat ("How do I win my deal with GreenLeaf?") that answers with an embedded meeting card and "Key opportunity signals".
- What makes it feel expensive: restraint. Everything is grey/white; the few colors carry meaning. Icons on every field label. Data looks real (real company logos, dollar amounts, dates, relative ages).

**Function** (from attio.com copy and shots)
- Records: People, Companies, Deals, plus custom objects. Lists ("Companies to work") are saved views with View settings and filters.
- Home greets "Good morning, Alex" with today's meetings (Today, Oct 14 with time ranges), "Prep for next meeting", "Recap last call" quick prompts. That is the morning screen.
- Ask Attio: chat panel available on every list (top-right "Ask Attio"), Slack bot ("@Attio what deals should I focus on today?" answered with "GreenLeaf (verbal yes, no quote out) and Ramp (stalled in Legal 5d)").
- Email composed in a side sheet over the list, prefilled by AI with a reason ("The intro email ties Maya's new VP role, the Series C, and 14 open AE roles").
- Call recording with transcript + speakers tab; workflows as a node graph (Record created -> Web agent -> Custom agent -> If -> Enroll in sequence).
- Changelog cadence: weekly entries (formula attributes, record page redesign, mobile activity feed, MCP server).

**Steal**
1. The kanban card anatomy: icon-led rows + footer with notes/tasks/comments counts + "days in stage" age stamp.
2. AI-filled attributes marked with a sparkle icon in the column header, so the user knows which data the system produced.

---

## folk (folk.app, folk.app/changelog)
Shots: folk-1 (kanban + person side panel), folk-2 (calls list + call transcript), folk-3 (deals pipeline), folk-4 (multichannel sequence).

**Visual**
- Light theme, white app on pastel marketing backdrops (sage, lavender, khaki). Inside the app: white, hairline dividers, almost no color.
- Typography: grotesk for names, a monospaced face for money ("$120,500", "$134,000" column totals). The mono numerals are a deliberate brand signature.
- Status pills are soft pastel fills with dark text: Contacted (green), Warm (peach), Call 3 (grey), Push to campaign (blue). Stage headers are pastel pills: Qualified / Proposal sent / Pitch scheduled, each with count and column total in mono.
- Cards (folk-1): avatar outline icon + name, email with @ icon, status pill, money, and a tinted footer strip for the next task with a colored dot: red "Overdue - Send branding contact", amber "Today - Call Devon at 2 AM".
- Record side panel slides over the right third: large avatar photo, name, company logo chip, "Relation summary" (AI, sparkle icon, text fades in), tabs Details / Interactions 12 / Notes 31 / Tasks 3, then an interaction list (icon, subject, preview, relative time).

**Function**
- Sidebar: Search, Notifications, Messages, Calls, Tasks, Dashboards, folk assistants; Records (People, Companies); Favorites as saved views (Clients, Sales report, Leads, Outreach campaign, Renewals).
- Views of the same group switch between People / Companies / Deals tabs; kanban grouped by status.
- Prospect: enrich lead (find emails/phones), LinkedIn/WhatsApp/Instagram/X capture via extension.
- Engage: sequence builder with branches (Wait 1 week -> If reply) across email, calls, messages.
- Calls: phone number in-app, recorded, transcribed, side panel shows the call as chat bubbles.
- Morning: Tasks + the overdue/today strips on cards; changelog shows "AI Follow-ups", "Recap Assistant", "Dashboards".

**Steal**
1. Next-action strip on the bottom of every pipeline card with overdue (red) / today (amber) dot. Answers "what do I do with this deal" without opening it.
2. Monospaced figures for every currency value and column total.

---

## Twenty (twenty.com, twenty.com/releases)
Shots: twenty-1 (companies table in a macOS window), twenty-2 (kanban, filtered table, command menu), twenty-3 (field widgets from release notes).

**Visual**
- Light theme, Notion/Airtable-like. Off-white sidebar, white main, 1px grid in tables, about 30px row height (dense).
- Every column header has a leading icon (link, person, map, target). Every cell value is a chip: URL in an outlined pill, people as avatar + name chips, booleans as check/x + True/False.
- Single saturated blue for the "+ New Record" button; sidebar object icons are individually colored (Companies blue, Opportunities red-orange target, Tasks green, Workflows orange).
- Bottom "Calculate" row under every table (sum/avg/count per column).
- Marketing site uses a serif display face and monochrome dark blocks; the product does not.

**Function**
- Objects: Companies, People, Opportunities, Tasks, Notes, Dashboards, Workflows; custom objects/fields; views (table, kanban), Filter / Sort / Options.
- Record pages are drag-and-drop layouts of widgets ("Custom layouts", "Field widgets", relation tables on record pages, files on records).
- Command menu: "Type anything", "Export selection as CSV", "Create 4 records", "Import data".
- Workflows: node diagram with iterator, HTTP request, Gmail send, manual triggers with bulk select.
- AI chat that can reference records with @ and skills with /.

**Steal**
1. The aggregate footer row ("Calculate") on every table.
2. Choose per object whether records open in a side panel or a full page (release 2.27).

---

## Clarify (clarify.ai, /changelog, /agents)
Shots: clarify-1 (Lead Finder: chat + results table), clarify-2 (people table with AI chat dock), clarify-3 (changelog cards).

**Visual**
- Light theme; the marketing wraps the app in soft pastel gradients (sky, peach, mint). The app itself: pale grey sidebar, white panes, hairlines.
- Sidebar groups with tiny caret headers: Home, Notifications (12), Tasks (7), Library, Skills, Connectors; Tools (Agents, Lead Finder, Campaigns, Forms, Workflows, Signals); Objects (Companies, People, Deals, Meetings); Chats (named threads like "Renewals at risk", "Demo count this month").
- Three-pane layout: sidebar | chat thread | result table. Skeleton shimmer rows while the agent fills the table.
- Colored seniority/priority pills (High, Medium, Low) in tables; one dark navy primary button ("Add to").

**Function**
- Chat is the primary input ("Find heads of finance in NYC at companies under 100 people") and it produces a saved search table you can Share, Save search, Add to list.
- Day narrative on the homepage: 9:00 AM meeting recorded and CRM updated; 3:00 PM "Ask Rep to find leads"; 5:00 PM "Ask for anything you need to close the deal" (decks, deal rooms, dashboards); night shift agents.
- Weekly ship notes: delegated sending, live meeting transcripts, rep docs and decks, record-level permissions, HTML emails.

**Steal**
1. Saved chats in the sidebar, named like reports ("Renewals at risk"), so a question becomes a reusable view.
2. Skeleton rows that fill in as the system works: visible proof the machine is doing the work.

---

## Day.ai (day.ai, lifeaftercrm.com)
Shots: dayai-1 (homepage hero), dayai-2 (agent card diagram).

**Visual**
- No real product UI is shown publicly. The site is a deliberate developer aesthetic: monospaced type throughout, ASCII box diagrams with hatched shadows, one saturated blue, light grey ground, plus a light/dark toggle.
- Agents are drawn as cards with a name, a job ("Morgan - pipeline analyst, reports to sam"), and skills on a schedule ("weekdays 07:00 morning briefing", "new email - inbox triage", "fridays 16:00 stale deal nudge").
- Bar charts (red vs blue) for "with/without context graph" time, tokens, cost.

**Function** (page copy)
- "Context graph" ingested from email, calendar, meetings, Slack; "agent control plane" with versioned agents, each reporting to a person, with an audit trail.
- Positioning essay "Life After CRM": the CRM record is going away; software watches everything.

**Steal**
1. Agents presented as named teammates with a schedule ("Morning briefing, weekdays 07:00, delivered to Slack"). That framing sells automation to a non-technical owner.
- Weak reference for UI; strong for how to talk about automation.

---

## Affinity (affinity.co, /product/crm, /product/relationship-intelligence)
Shots: affinity-1 (CRM hero with list + person card), affinity-2 (activity timeline chart + feed), affinity-3 (Top Founders sheet + "people you know" card), affinity-4 (intro paths).

**Visual**
- Marketing: deep aubergine/plum with a serif display face (luxury private-capital tone). Product: light, white, small type, lavender owner chips, colored status dots (New blue, Won green, Lost red, On hold amber).
- List views have tabs Sheet View / Board View / Dashboard on the same list.
- Person card: big initials avatar, "1 Person You Know", "12 People Your Team Knows", each with a green 3-bar relationship-strength meter.
- Activity Timeline as a stacked bar chart per month with an emails/meetings feed next to it.

**Function**
- Automatic activity capture from email/calendar (no manual logging), enrichment from 40+ sources (Pitchbook, Preqin, Grata).
- Relationship strength scoring, warm-intro paths through colleagues, meeting briefs before every call, pipeline updates after meetings, "coverage gaps flagged before the Monday review".
- "Partners never have to log in": intelligence delivered via email, Claude, ChatGPT (MCP).

**Steal**
1. Relationship-strength bars beside every person ("who on our team knows them, and how well").
2. Sheet / Board / Dashboard as three tabs over one list, not three separate pages.

---

## Close (close.com)
Shots: close-1 (lead record with live AI call), close-2 (sales pipeline), close-3 (power dialer list), close-4 (agents).

**Visual**
- Light theme, white app on a pale lavender ground with blurred wave graphics. Brighter and more colorful than Attio but still disciplined.
- Lead record (close-1): two-column. Left rail = contacts block (name, title, email/SMS/call icons) and company block (location, URL, description, "Enriched 4 fields via AI" in purple with the AI-filled values in purple). Right = activity column: a green banner "AI Agent is on a call with Dana Crell" with a "Take Over" button, then the call card with live transcript, waveform, AI Notetaker summary.
- Top action bar on every record: calendar, note, email, SMS, call, +.
- Pipeline (close-2): yellow stage pills (Demo Completed 6, Proposal Sent 2, Contract Sent 12), a blue band with "ANNUALIZED VALUE $75,500" per column, cards with company logo, uppercase status chip + heat chip (HOT red, COLD amber), contact with phone/email icons, and a 2-line AI note ("Needs cosign from other VP out on PTO, returns Monday. Verbal commit."). Toggle "Needs attention" in the filter bar.
- Dialer list (close-3): "Calling High Priority Leads 4 of 14" progress bar, "3 connected / 10 queued", each row with live agent state ("Agent calling" + green Join Call button).
- Marketing narrative is time-stamped: 8:47 AM Pipeline, 9:23 AM Calling, 2:30 PM Agents.

**Function**
- Built-in calling, SMS, email, power dialer, sequences ("workflows"), AI agents that call/qualify/follow up, AI notetaker, Chloe assistant ("What deals need my attention today?"), reporting, MCP.
- Morning: Smart View of priority leads, hit dial, Close moves through the list.
- Speed-to-lead framing: "Only 7% of companies respond within 5 minutes; average 42 hours".

**Steal**
1. Every pipeline card carries a one-line, human-written-sounding next step / context note generated from the last conversation.
2. The record page action bar (calendar, note, email, SMS, call) pinned top-right on every record, always in the same order.

---

## Pipedrive (pipedrive.com/en, /en/features/pipeline-management)
Shots: pipedrive-1 (deals kanban), pipedrive-2 (hero devices), pipedrive-3 (people list with labels).

**Visual**
- Light theme, dark navy icon-only rail with a purple active state, white workspace, bright green "+ Deal" button. Bold 600-weight deal titles, large type.
- Kanban: column header "Qualified / 10 000 $ · 4 deals", cards with title, org, owner avatar, value, and a green ">" or red "<" activity indicator; a rotting card turns pink with a red "3d" badge (deal idle too long). Colored label bars on top of cards.
- Marketing uses lime green, purple, and flat illustrations; feels like SMB software.

**Function**
- Pipeline kanban with list and forecast toggles, activities (call/email/meeting scheduled per deal), automations, insights reports, Nova meeting intelligence, 500+ integrations, mobile.
- Morning: activities due today, deals with no next activity flagged red.

**Steal**
1. "Rotting" deals: card tints red with a day count when nothing happened in N days.
- Cheap-looking parts to avoid: heavy saturated chrome (navy rail + green buttons + purple active), chunky bold text, illustration-heavy marketing.

---

## Linear (linear.app, /insights, /changelog/2026-09-03-priority-inbox)
Shots: linear-1 (issue page with agent panel), linear-2 (priority inbox), linear-3 (insights analytics).

**Visual**
- Dark theme done right: near-black #0f0f10-ish canvas, panels one step lighter, borders barely visible (#ffffff10-ish), text in three greys (primary, secondary, tertiary), almost no color except status icons (yellow in-progress ring, green done, purple PR icon) and red/green diff counts.
- Type: Inter-style, 13-14px, medium weight for titles, generous line height. Monospace only for code identifiers (`vehicle_state`, branch names).
- Issue page: sidebar | document-like main column (title, description, Activity feed with system events in tertiary grey, comments in bordered cards) | right properties rail (Reviews, status, priority, labels, cycle). "1 / 84" with up/down arrows to move through the list without leaving the page.
- Inbox: Priority 4 / Other 12 segmented pills, rows with avatar + small action badge (assigned, mentioned), title, reason line, status icon, age.
- Insights: dark tables and scatter charts with one highlighted series.

**Function**
- Keyboard-first: every action has a shortcut; Cmd+K command menu; J/K navigation implied by "1 / 84".
- Inbox triage with Priority split; agents work on issues in a docked panel ("Worked for 10 sec", "Changed 2 files +22 -10", Preview).
- Insights dashboards, initiatives/projects, Pulse feed. Morning screen: Inbox (Priority tab) then My issues.

**Steal**
1. Previous/next record navigation in the record header ("1 / 84 ^ v") so a user can work a list one record at a time.
2. Priority / Other split in the inbox, with the reason for each item ("Didier assigned the issue to you", "Project update is overdue").

---

## Synthesis

### Patterns the premium products share (Attio, folk, Twenty, Clarify, Close, Linear, Affinity's product)
1. **Neutral ground, color only for meaning.** UI chrome is white/grey (or near-black in Linear). Color appears only in stage dots, status/heat chips, avatars, AI markers, and one primary button. Attio's whole kanban uses four stage-dot colors and nothing else.
2. **Three-pane shell.** Narrow sidebar (workspace switcher, search/⌘K, Home, Notifications, Tasks, then Records, then Favorites/saved views) | main view | right side panel that opens a record over the list without navigating away (folk-1, Attio composer, Clarify chat, Linear agent panel).
3. **Record page = facts left, activity right.** Close: contacts + company facts in a left column, timeline of calls/emails/notes on the right with an action bar (calendar, note, email, SMS, call) top-right. folk: header with photo and AI relation summary, then tabs Details / Interactions N / Notes N / Tasks N. Linear: document in the center, properties in a right rail.
4. **Icon-led fields everywhere.** Column headers and card rows each start with a small line icon (calendar, $, person, link). This is what makes dense data feel designed rather than dumped (Attio, Twenty, folk, Close).
5. **Pipeline cards answer "what next" without opening.** Each card shows amount, owner avatar, close date, a next-step or AI context line, and a time signal (Attio "12d", Pipedrive red "3d" rot badge, folk Overdue/Today strip). Column headers show count plus total value (folk mono "$134,000", Close "ANNUALIZED VALUE $230,800").
6. **Saved views are first-class navigation.** Favorites in the sidebar are named lists ("Clients", "Renewals", "Companies to work", "High Priority Leads") with Sheet/Board/Dashboard tabs over the same data (Affinity, folk, Twenty).
7. **A morning surface that is a queue, not a dashboard.** Attio Home ("Good morning", today's meetings, prep/recap actions), Linear Inbox (Priority vs Other), Close Smart View dialer ("4 of 14, 3 connected"), Clarify "Notifications 12, Tasks 7". Nobody opens on KPI tiles.
8. **AI shows its work, and is marked.** Sparkle icon on AI-filled columns (Attio ICP score), "Enriched 4 fields via AI" in purple (Close), "Relation summary" (folk), skeleton rows filling in (Clarify), "Worked for 10 sec" (Linear). AI output is labeled and inline in the record, not a separate chatbot page.
9. **Command menu + keyboard.** "Quick Actions ⌘K" in Attio's sidebar, Twenty's command menu, Linear's list navigation. Premium apps expose speed.
10. **Dense, small, quiet type with tabular numbers.** 13-14px body, regular weight for data, medium for titles, no bold rows; money in tabular/mono figures (folk), realistic demo data (real logos, real amounts, relative times like "5m ago", "Yesterday").

### What makes a CRM look cheap
1. **Saturated chrome.** Colored nav rails, colored primary buttons in several places, colored page headers (Pipedrive's navy rail + green "+ Deal" + purple active state). Premium apps spend color on data, not chrome.
2. **Dashboard-first home of KPI tiles and donut charts.** None of the premium products lead with stat cards; they lead with a queue of things to do today.
3. **Cards and tables without icons, avatars, or time signals.** Bare "Name / Status / Value" text in boxes with heavy borders and shadows reads as an admin template.
4. **Bold, large type everywhere and uniform emphasis.** Pipedrive's 600-weight titles at large size; when everything is bold nothing ranks.
5. **Fake-looking or empty data and navigation to separate pages for every record.** Premium tours use believable data and open records in a side panel; a CRM that full-page-reloads into a form per record feels like a database admin.

### Note for Launch Control (dark theme)
Linear is the only premium reference in dark mode and it is the template for how to do it: no pure black panels on pure black, borders at ~6-10% white, three text greys, color reserved for status icons. The Jordan yellow #f0c419 should behave like Close's yellow stage pills or Linear's in-progress ring (status and the one primary action), never as decorative chrome.

### Three strongest references
1. **Attio**: the best overall model: neutral shell, icon-led fields, kanban card anatomy, ⌘K, Home with today's meetings, AI attributes marked inline.
2. **Close**: the best record page and the best "work the queue" screens for an owner-operator: facts left / activity right, action bar, dialer progress list, AI next-step line on every pipeline card. Closest to what a $10k custom CRM for an SMB should do.
3. **Linear**: the dark-theme benchmark and the interaction model (inbox Priority split, prev/next record navigation, keyboard).

Runner-up: folk for the next-action strip and mono currency; Twenty for the table aggregate row.
