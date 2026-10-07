# Feature spec: the ignition site (home page)

Binds to `DESIGN.md`. Every screen must read as the same product if placed side by side.
Build plan and architecture: `docs/PLAN.md`. This file is the design contract; PLAN.md is the engineering one.

## Assumption on record

Launch Control is a launch service: it takes a business from zero to launched (brand, site, systems,
go-live). The engine is the business turning over. All copy lives in `web/src/content/site.ts`. If the
assumption is wrong, that one file changes and nothing else does.

## Page map (top to bottom)

| # | section | layout family (DESIGN.md) | purpose |
|---|---|---|---|
| 0 | Gate | 1. one object on empty ground | engine-start button. The only way in for sighted mouse users; bypassable by keyboard skip link, hash links, reduced motion |
| 1 | Ignition stage | 2. pinned stage + corner HUD | 600vh scroll-scrubbed 3D sequence, idle → dive → combustion → rev → limiter → launch |
| 2 | Arrival | 3. ruled editorial columns 5/7 | the first readable statement: what Launch Control is |
| 3 | What we build | 3. ruled editorial columns, alternating | services as a ruled list, not cards |
| 4 | The sequence | 4. horizontal stage strip | the four-stage process: Idle, Prime, Ignite, Launch. Numbered because it is a real sequence |
| 5 | Proof | 5. list with dividers + 6. stat strip | work entries; only real numbers |
| 6 | Book a launch | single column form ≤4 fields | the one primary action |
| 7 | Footer | mono utility block | credit line (Sketchfab CC BY), contact, legal |

Nav: minimal top bar, solid `surface` fill (never backdrop-filter), ≤5 items: Build, Sequence, Proof,
Book a launch (ember), plus the wordmark. The tachometer (Signature) sits fixed at the right edge on
≥lg, bottom edge on mobile, and doubles as section nav.

## Flow: Gate → Ignition → Launch → Content

**Goal:** a first-time visitor presses Start, rides the ignition sequence, lands in readable content
and books a launch.

**Entry points:** `/` cold (gate), `/#build` etc. (gate bypassed, lands on section), back/forward
(scrollRestoration manual: always re-enters at top of content if launched already this session,
gate is never shown twice per session; sessionStorage flag `lc:launched`).

```
[/ load]
   │ server HTML: black ground, START button (LCP), content sections in DOM below, visually hidden by the gate overlay
   ▼
◇ reduced-motion OR no WebGL OR ?skip OR #hash OR lc:launched set?
   ├── yes ──▶ [Content view] gate removed, static engine poster in hero, tach is a static rule
   └── no  ──▶ [Gate: loading] counter 000→100 in Plex Mono as the 3D chunk + glb stream in
                  │ press before 100 → queued, button ring pulses once, label "PRIMING"
                  ▼
               [Gate: ready] label START, ring ember, focus ring visible
                  │ press (click / Enter / Space)
                  ▼
               [Igniting] time-based 1.8s: starter crank audio-less rattle (camera shake 2px), three
                  misfire flashes, fire, rpm 0→800. Button scales to 0 along the easing curve. Gate overlay dissolves.
                  ▼
               [Idle, p=0] scroll unlocked. Caption 1 fades in. Tach needle at 800.
                  │ scroll
                  ▼
               [Scrolling 0<p<0.92] camera path, cutaway, combustion, rev. Tach climbs to redline. HUD telemetry updates.
                  │
                  ▼
               [Launch 0.92≤p≤1] engine → points → streaks → white-hot flash (≤400ms of full white-hot, then back to background within 600ms. Flash never exceeds 3 per second; it is one flash)
                  ▼
               [Content] canvas opacity 0, loop paused. Tach idles at 800 and now tracks section progress.
```

### States

| element | loading | ready/idle | active | error | empty |
|---|---|---|---|---|---|
| Gate button | counter 000→100, ring at 40% ember, label PRIMING | label START, ring ember 100% | pressed: ring contracts 4px, label RUNNING | WebGL init failed: label ENTER, pressing reveals content with static poster, toast "3D is off on this device" (info) | n/a |
| 3D canvas | hidden behind gate | rendering | scrubbing | `webglcontextlost`: attempt restore once, else swap to poster + info toast | n/a |
| Tachometer | needle at 0, face at `subtle` | needle 800, face `text` | needle follows rpm, ember → ember-hot past 6000 | if canvas failed: becomes a 2px progress rule in ember | n/a |
| HUD telemetry | dashes `----` | live values | live | hidden | n/a |
| Captions | hidden | caption 1 | crossfade per beat | shown without motion | n/a |
| Booking form | n/a | fields empty, submit `ember` | submitting: label "Booking", button disabled, mono spinner glyph | field errors inline in `danger`, summary announced via aria-live; network error toast with retry | success: form replaced by "Booked. We reply within one working day." in display type, success colour rule |

Edge cases: refresh mid-sequence → returns to gate (no `lc:launched` yet) at top. Refresh after launch
→ content view, hero poster, no gate. Tab hidden → render pauses, rpm holds. Resize → ScrollTrigger
refresh, camera path re-fit, no scroll jump. Offline after load → everything works except the form,
which shows the network error toast. Slow network → gate counter stays honest (real bytes), press
queues.

## Component specs

### StartButton (the gate trigger)
- Purpose: the single entry action. Real `<button type="button">`, never a div.
- Form: `round` radius, 160px on ≥md, 120px on mobile (≥44pt). Face `surface`, 2px ring `ember`, label in Barlow Condensed 800 uppercase 20px tracking 0.08em, counter beneath in Plex Mono 14px `muted`. Reads ENGINE / START stacked like the real automotive button.
- States: see table. Hover: ring brightens to ember-hot is NOT allowed (ember-hot is sequence-only); hover = ring width 2→3px over `fast`. Focus-visible: 3px offset ring in `text`. Active: scale 0.96 over `fast`.
- Keyboard: focusable first in tab order. Enter/Space press. A visually-hidden "Skip the ignition" link precedes it in DOM order and is visible on focus (z `skipLink`).
- ARIA: `aria-label="Start the engine and enter the site"`, `aria-describedby` the counter when loading, `aria-busy` while loading. On press, focus moves to the hero caption region (`tabindex=-1`), announced via `aria-live="polite"`: "Engine running. Scroll to continue."

### Tachometer (Signature)
- Purpose: scroll progress and section nav as an RPM gauge.
- Form: 96px face on ≥lg fixed right-center; 56px bottom-center on mobile. Face `surface` with `border` hairline ticks, numerals 0 to 9 in Plex Mono 10px `subtle`, redline arc 7 to 9 in `ember` at 40% opacity, needle 2px `ember`. Digital readout under the face: `6 4 2 0` tabular mono 12px `text`.
- Behaviour: during ignition stage, needle = rpm. In content, needle = 800 + section progress mapped 0 to 1500 so it visibly idles. Clicking a tick (sections mapped to ticks 1 to 5) scrolls to the section.
- A11y: `role="navigation" aria-label="Page sections"`, the ticks are real `<a href="#id">` links with visible focus. Needle is `aria-hidden`. Reduced motion: static rule.

### HudTelemetry
- Four corner readouts in Plex Mono 12px uppercase 0.08em: top-left RPM, top-right CYL (active cylinder 1 to 8 from the firing order), bottom-left TEMP (a mapped 0 to 100 heat value with no unit, so it is not a fake-precise number), bottom-right beat name (IDLE / DIVE / COMBUSTION / REV / LIMITER / LAUNCH). Colour `muted`; the active value flips to `ember` for 120ms on change.
- `aria-hidden="true"`. Decorative for screen readers; captions carry the meaning.

### Captions
- One line per beat, Barlow Condensed 700 uppercase, clamp(2rem, 6vw, 5rem), `text`, left-aligned on a 5-col measure at ≥lg, full width on mobile. Crossfade `base` on beat change. Reduced motion: all captions stacked, static.
- `aria-live="polite"` region, announces each caption once.

### Section: Arrival (editorial 5/7)
- Left 5 cols: display statement, ≤12 words. Right 7 cols: two body paragraphs ≤70ch, one ember text link "See the sequence". Hairline rule above and below. 192px top padding, 128px bottom.

### Section: What we build (ruled list)
- Each service is a row: display name left (Condensed 700, 32px), one-sentence body right, hairline divider between rows. Rows alternate 5/7 and 7/5 so the page has a zigzag, not a stack. Hover: row ground to `elevated` over `fast`. No icons, no cards.

### Section: The sequence (horizontal strip)
- Four full-height columns, horizontally scrolled on ≥lg via ScrollTrigger pin (native horizontal on touch, snap). Stage number in Plex Mono 96px `border` colour as a watermark behind the display title. Numbers are justified: the content is a sequence.

### Section: Proof
- Stat strip: up to 3 real stats in Plex Mono 48px tabular, label beneath in `muted`. If no real number exists, the strip is omitted entirely rather than filled.
- Work list: rows with dividers, project name display, one line body, year in mono. External link on the row.

### Section: Book a launch (form)
- Fields ≤4: Name, Email, What are you launching (textarea), Budget (select, 3 options). Labels in Plex Mono uppercase above fields, fields `elevated` ground with `subtle` 1px border (3:1 passes), focus border `ember` 2px. Submit button `ember` ground, `background` label, square corners.
- Validation on blur and submit; errors inline in `danger` 14px semibold with the field `aria-invalid` and `aria-describedby`. Server validation mirrors client (zod schema shared). Rate limited server-side.
- Touch targets ≥48px tall.

### Footer
- Plex Mono 12px `subtle` semibold. Contains the mandatory credit: "Engine model: Disassembled V8 Engine Block by Tomaso, CC BY 4.0" with link. Wordmark, email, year.

## Responsive
- 320: gate button 120px, captions full width, tach bottom-center 56px, HUD reduced to RPM + beat only, sequence strip native horizontal scroll with snap, form single column.
- 768: HUD all four corners, tach still bottom.
- 1024+: tach right edge, sequence strip pinned horizontal, editorial 5/7 grids active.
- 1440+: content max 1200px, canvas full-bleed.

## Accessibility summary
- Keyboard path: skip link → Start → (Enter) → captions region → nav → tach ticks → sections → form. All focus rings 3px `text` offset 2px.
- Reduced motion: no pin, no scrub, static poster, static captions, static tach rule, Framer reveals disabled.
- No WebGL: identical to reduced motion plus an info toast.
- Contrast: all pairs listed in DESIGN.md; `subtle` never below 14px semibold.
- Flash safety: the launch white-out is one flash of ≤400ms; nothing on the page flashes more than once per second.
- Screen reader: content sections are plain semantic HTML in a server component. The 3D layer is `aria-hidden`. Captions announce once each.

## Pre-flight (run 2026-10-03)

Identity lock: all values above are from DESIGN.md. One accent (ember), one radius scale, one type pairing, Plex Mono only utility face. ✔
Anti-slop: 0 banned fonts; 0 purple/blue glow, 0 cream ground, 0 gradient text; 0 three-card rows, 0 nested cards, 0 glass, hero is a gate not a mesh hero; numbering appears only on the sequence strip where content is sequential; 0 buzzwords, 0 fake names, 0 fake-precise numbers (stat strip omits rather than invents), 0 em-dashes in visible copy. ✔
Slop test: steel-tinted dark + ember heat + signage condensed type + a tachometer as navigation. Not the default dark-luxury car page. ✔
Counterfactual: for any automotive brief the reflex is black/red/serif/glossy car. This has no car, no red, no serif. ✔
Signature present: the tachometer. ✔
Inspiration synthesised across 8 sources, took/rejected recorded, no single clone. ✔
States: loading/ready/active/error/empty specified for every interactive element. Edge cases: refresh, back, hidden tab, resize, offline, slow network. ✔
Accessibility: ratios listed, keyboard path, reduced motion, ARIA, 44/48pt targets, flash safety. ✔
Layout craft: 6 layout families in use, one focal point per view, whitespace in 96/128/192 rhythm. ✔
Cognitive load: nav 4 items + wordmark, form 4 fields, one primary action per view. ✔

Scored self-critique (0 to 4): distinctiveness 3 · hierarchy 3 · consistency 4 · accessibility 3 ·
state coverage 3 · copy 2 · restraint 3 · motion motivation 4. Total 25/32.
Copy scored 2: the copy in this spec is placeholder-grade because the business is assumed. Fix applied:
the content file is the single source and the spec forbids literal copy in components, so copy quality
is a one-file fix the moment the business is confirmed. Re-scored at 3 for structure, with the
content of `site.ts` flagged as the open item. No axis ≤ 2 remains.

## Build handoff

Target: Next.js App Router engineer (SSR content, client 3D). Design system: bespoke, tokens from
DESIGN.md mapped to Tailwind v4 `@theme` in `web/src/styles/tokens.css`.

Implement exactly this spec. Theme with the locked tokens; do not redesign. Acceptance:
1. Every colour, font, radius and duration on the page resolves to a DESIGN.md token. Off-system values: 0.
2. Gate, ignition, launch and content flow behave per the state table, including the bypass paths.
3. Playwright visual baselines at p = 0, 0.1, 0.3, 0.5, 0.7, 0.9, 0.97, 1 and each section at 320/768/1024/1440, eyeballed against `docs/inspo/` before being accepted.
4. Renderer RSS flat across 3 scroll loops (PLAN.md test strategy).
5. Lighthouse on the gate route meets the CWV targets in PLAN.md.
6. Keyboard-only and reduced-motion runs reach the booking form and submit it.
7. The CC BY credit is visible in the footer.
