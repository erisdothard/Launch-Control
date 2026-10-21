# Dark premium UI references for the Launch Control CRM (2026-10-20)

Research only, no code changed. All images are in `dark-ui/`, the contact sheet is `dark-ui-sheet.png` (numbers below match it),
and rejected captures are kept in `dark-ui/rejected/` for traceability. Dribbble images are the shot's og:image at 1600x1200;
site captures are Playwright 1440x900 (chromium, `--disable-gpu --disable-webgl`, dark colour scheme).

The brand site came from **https://golaunchcontrol.com** because localhost:3100 was down (HTTP 000). The headless run has
no WebGL, so the engine is off ("3D IS OFF ON THIS DEVICE") and the hero is plain text on near-black.

## Kept references

| # | File | Source |
|---|------|--------|
| 01 | dribbble-ai-route-optimization-platform-supply-ch.png | https://dribbble.com/shots/27288237-AI-Route-Optimization-Platform-Supply-Chain-Deliveries-Track |
| 02 | dribbble-apex-gt-driver-console.png | https://dribbble.com/shots/27521337-Apex-GT-Driver-Console |
| 03 | dribbble-crm-customer-list.png | https://dribbble.com/shots/27682582-CRM-Customer-List |
| 04 | dribbble-dark-mode-dashboard-for-data-driven-team.png | https://dribbble.com/shots/27594018-Dark-Mode-Dashboard-for-Data-Driven-Teams |
| 05 | dribbble-dashboard-design-motorsport-racing-telem.png | https://dribbble.com/shots/27317601-Dashboard-Design-Motorsport-Racing-Telemetry-Interface |
| 06 | dribbble-drone-airframe-diagnostics-dark-ui-for-u.png | https://dribbble.com/shots/27655652-Drone-Airframe-Diagnostics-Dark-UI-for-UAS-Control |
| 07 | dribbble-drone-fleet-mission-control-dashboard.png | https://dribbble.com/shots/27720298-Drone-Fleet-Mission-Control-Dashboard |
| 08 | dribbble-formula-1-racing-mobile-app-concept.png | https://dribbble.com/shots/27462952-Formula-1-Racing-Mobile-App-Concept |
| 09 | dribbble-human-in-the-loop-ai-decision-dashboard.png | https://dribbble.com/shots/27513492-Human-in-the-Loop-AI-Decision-Dashboard-for-Logistics-Operations |
| 10 | dribbble-kinotics-the-autonomous-workforce-manage.png | https://dribbble.com/shots/26834952-Kinotics-The-Autonomous-Workforce-Management |
| 11 | dribbble-record-details-page.png | https://dribbble.com/shots/27786810-Record-Details-Page |
| 12 | dribbble-vanta-crm-luxury-business-sales-mobile-u.png | https://dribbble.com/shots/27297005-Vanta-CRM-Luxury-Business-Sales-Mobile-UI-Kit |
| 13-14 | godel-terminal-2.png, godel-terminal.png | https://godelterminal.com |
| 15-16 | linear-2.png, linear.png | https://linear.app |
| 17 | raycast-2.png | https://www.raycast.com |
| 18 | teenage-engineering-2.png | https://teenage.engineering/products/op-1 |
| 19 | vercel-observability.png | https://vercel.com/observability |
| 20-22 | brand-site-1..3.png | https://golaunchcontrol.com |

Rejected after viewing: Arc, Attio and Superhuman (their marketing sites are now light), f1-dash (now a shutdown notice),
the Vercel and Raycast heroes and Linear's isometric section (no product UI in frame), and six Dribbble shots: LuxAuto
(bubble chart, generic card grid), SaaS CRM laptop, Salesforce tilted render (lime glass), Ra27 (800px, dated), the
F1 JBET fragment (purple neon) and the Esports bracket (cyan neon, every surface equally loud).

Note: Dribbble has two shots titled "AI Route Optimization" by the same studio, 27347147 and 27288237. They share a filename,
so the second one (27288237) overwrote the first. Both look alike, with a map hero and the orange #1045 tracking list.

## What makes each one feel premium

**01 Route optimization (logistics).** The map is the hero and takes the largest tile. Cards are not the hero. The whole
screen uses one accent, orange, and it always means the same thing: the route line, the progress bar inside each shipment
card, the active nav icon and the warning. Load cards use a large `#1045` ID, then a city pair as an origin-to-destination
row, then a progress track with a truck glyph, so the data reads as a journey rather than a list. Money sits in a plain
ruled ledger (label left, figure right), not in stat cards. It is the closest thing in the set to DispatchRelay and Hyper
Racer's pipeline.

**02 Apex GT console.** It is pure instrument: thin hairline corner brackets instead of boxed cards, huge thin numerals (`0 KM/H`),
and red used only for live state (IGNITION ON, the throttle track). It is a warning as much as a model: wide-tracked mono
uppercase on *every* label tips it into cosplay, which is the exact tell Launch Control's CRM already has.

**03 CRM customer list.** An Attio/Notion-grade table. Row height and type are tight, the sidebar sits flush with no card
around it, and the controls are text-like (Filters, Sort, Layout) rather than buttons. The column footer carries aggregates
("Sum: $20,530,760.90"), so totals live in the table itself and no stat cards are needed. Restraint is the premium signal.

**04 Data-driven teams (ARC, orange).** One orange, used as a *material*: hatched and striped bars for "this month", while
the past is grey hatch. Each metric's micro-viz is a different shape (barcode ticks, segmented bar, stripes), so the three
stat tiles do not look like clones. The headline greets in sentence case before any numbers ("Here's what's happening today").
An architectural orange light-leak in the background gives depth without glass.

**05 Race Intelligence (McLaren Applied).** The strongest motorsport reference. Thin, enormous wide display type
("RACE INTELLIGENCE") sits over a dark photo of the real asset. Data panels are smoked translucent slabs anchored to the
lower right and overlapping the photo, which gives real layering. Stint numbers (12 laps, 1:13.526, LAP 18-22) are big and
light, with tiny labels above them. The accent is a single yellow on the live trace. The nav is a quiet text list with no icons boxed.

**06 Drone airframe diagnostics.** A 3D wireframe of the object sits in the centre, with status ringed around it. Segmented
"readiness" bars come in discrete ticks, not a smooth progress bar. Status words (NOMINAL, WARN) are coloured text with no
pill. Green appears only where the system is healthy. Proof that a hero object plus instrument rings beats a card grid.

**07 Drone fleet mission control.** A single scene with a map, a 3D object and an orange heat bloom carries the screen, and
the controls live in compact docked panels around the edge. A waypoint timeline (WP1 to WP4) is a simple stepped progress
track, which maps cleanly onto deal stages.

**08 F1 mobile concept.** Typography is the design: season points stacked in a giant numeral (4987) in yellow, names set
huge and tight. Tall portrait panels with full-bleed photography do the rest. One yellow, used for the hero numeral only.

**09 Human-in-the-loop AI review (logistics).** A work queue, not a dashboard. Pending decisions are cards carrying a
priority chip, a route, a confidence figure and $ impact, plus one orange **Approve** primary with Reject and Edit as
outlined squares. On the right it explains *why* in "AI Explanation" with key-factor bars. This is the pattern for the
CRM's agents ("every automated decision shows its reasoning", from brand-site-2).

**10 Kinotics.** Near-black slabs separated by tone rather than borders. Orange appears only on "current shift" bars
against grey history and on the E-STOP. The system log is mono, but the rest uses a sans, so mono is reserved for machine
output. It feels expensive because roughly 90% of the screen is quiet.

**11 Record details (drawer).** A right-side record drawer over a blurred, dimmed list. Properties sit in a two-column
label/value list with icons, followed by Meetings, Progress, Notes and Activity sections divided by spacing, with "See all"
text links. Only the probability bar is coloured. This is the right shape for a lead or deal record.

**12 Vanta CRM.** Luxury through type alone: a high-contrast serif greeting ("Good morning, James Whitfield") and a single
hero figure ($2.84M), with gold restricted to the brand and the hero tile's hairline. Secondary figures shrink. It shows that
a *personal sentence* opening the screen reads as concierge rather than admin.

**13-14 Godel Terminal.** Bloomberg-dense, but it holds together because the grid is ruthless: equal gutters, monospaced
tabular figures, red and green only for deltas, and a circular command wheel as the signature object. Its marketing line
"A $30,000 terminal can't go on every desk" shows that a price-anchored premium story can live inside the product's own voice.

**15-16 Linear.** The app chrome nearly disappears: a flush sidebar, no card borders, and layers made from 2-3 near-black
tones (bg #08090a, raised panels slightly lighter). The issue title is set larger with prose under it, and activity is a
quiet timeline with tiny avatars. Its single accent (yellow star, status dot) shows up only on state.

**17 Raycast.** A command palette as the primary interaction. The keyboard-first list sits on a dark glass panel with a
blurred warm glow behind it. The colour comes from content (the swatches), not from the chrome.

**18 Teenage Engineering OP-1.** Physical product UI: a tiny high-contrast display among neutral hardware keys, with one
red record key and one orange knob. The lesson is that colour is *coded to function* and rare, and the numerals are big
and graphic ("12 DELAY").

**19 Vercel observability.** Single-line charts on pure black with no fill, no gridlines and a tiny tooltip. The anomaly
graph is grey until the incident window, which turns red with a faint red wash. Tables use right-aligned tabular numbers,
and the one red pill is the error rate. Colour = exception.

**20-22 Launch Control site (brand continuity).** Near-black ground, silver sentence-case Sora headings, a yellow
solid CTA and a yellow outline "BOOK A LAUNCH", a short yellow/orange/red stripe above the eyebrow, wide-tracked yellow
eyebrows (HYPER RACER USA · 2026), hairline rules, and a numbered "01 / 04" stepper with a left yellow bar on the active
item. The site already uses restraint, so the CRM should inherit it rather than pile on boxes.

## Synthesis: techniques that read as expensive

1. **A hero object per screen, not a card grid.** Each strong screen has one dominant thing: a map (01, 07), the asset
   photo (05), a 3D object (06), or a giant numeral (08). Everything else is docked around it at smaller scale.
2. **Colour = state, used once.** One accent, always meaning "live / now / act". Kinotics (10) puts orange only on the
   current shift, Vercel (19) uses red only for the anomaly, and Linear (16) keeps yellow for status. Grey carries history.
3. **Layer by tone, not by border.** Linear (16) and Kinotics (10) separate surfaces with 2-3 near-black steps plus
   spacing, and the hairline is the exception. Race Intelligence (05) overlaps smoked slabs on a photo for real depth.
4. **Type scale contrast does the hierarchy.** Huge light numerals and tiny labels (05 stint row, 08 "4987", 02 speed)
   instead of every figure at the same 24px bold. Wide display type is reserved for one headline per screen (05).
5. **Data as a journey or a ledger, not tiles.** Origin to destination progress tracks (01), stepped waypoints (07),
   ruled label/value ledgers (01 Daily Costs), and aggregates in the table footer (03).
6. **Distinct micro-viz per metric.** Hatch, ticks, segmented bars and a single line (04, 06, 19), so no two KPIs look cloned.
7. **Open with a sentence.** "Here's what's happening today" (04) and "Good morning, James Whitfield" (12): a human
   greeting plus 1-2 numbers beats a 4-tile KPI row.
8. **Work queue with explained decisions.** Pending cards carry the reason, confidence and $ impact, with one primary
   action (09). This turns the CRM from a database into an operator's console.
9. **Drawer records, keyboard-first.** A right-side record drawer over a dimmed list (11) and a command palette (17)
   keep context and feel pro-grade.
10. **Mono only for machine output.** Logs, IDs and timestamps get mono (10, 13), and everything human uses the sans.

**Template tells to avoid** (several are present in the current CRM per the brief):
- identical bordered boxes everywhere, all with the same 1px border, radius and padding
- every number in its own stat card in a row of four
- mono uppercase tracked labels on everything (02 shows how fast this turns into cosplay)
- the accent sprinkled decoratively on icons, headers and badges, so it no longer means anything
- donut and bubble charts with rainbow series (LuxAuto, rejected)
- pill badges for every status where coloured text would do
- boxed icon nav plus a "Dashboard" H1 with nothing else to say
- glass blur or neon glow as the premium signal (Esports, Salesforce, rejected)

## Mapping onto Launch Control's brand

- **Yellow #f0c419 = the one "act now" colour.** Use it for the primary Approve or Call action, the live or current-stage
  marker and the selected row bar (the site's "01 / 04" left bar). Never use it on icons or headers. Everything historical is silver or grey.
- **The livery stripe is a status ribbon, not decoration.** Put the yellow, orange and red stripe on a record's edge or progress
  track to encode heat or urgency (yellow = new, orange = due today, red = overdue). It is the brand's own version of 01's
  route line and 10's current-shift bars.
- **Michroma once per screen.** Use it for the screen's hero (the pipeline value, the deal or lead name at display size, the
  wordmark) and for buttons, as on the site. Body and labels go in Sora sentence case, and Chivo Mono only for IDs, timestamps,
  phone numbers and the agent activity log (10's rule).
- **Silver #c6ccd3 numerals at large, light scale.** Follow Race Intelligence (05): set stint-style figures big in silver
  with tiny Sora labels above. Drop the 4-up stat cards and open with a sentence ("Good morning, Max. 3 leads need a call,
  1 quote is waiting") plus one hero figure.
- **The Today view is a work queue (09).** Show agent-screened leads as cards with the reason, urgency and est. value, one yellow
  primary action and an expandable "why" panel. That makes the site's promise visible: "every automated decision shows its reasoning".
- **Tone-layered near-black instead of boxes.** Use 3 surface steps (ground, raised, overlay), a flush sidebar, and hairlines
  only to divide a ledger. A record opens as a right drawer over the dimmed list (11).
- **Deals as a track, not a kanban of identical cards.** Show stages as a stepped track like 07's waypoints, with each deal riding a
  progress line like 01's shipments, and the livery stripe marking the current stage.
- **Optional signature object.** Use a dim engine or car silhouette, or the Hyper Racer photo, as a background plate behind the
  hero figure on the home view (05's technique). It ties to the marketing site's "engine as background", and the brand already owns the asset.
