---
project: Launch Control
register: brand
aesthetic_direction: professional services firm, dark, with a background engine
color_strategy: restrained
design_system: bespoke
design_variance: 7
motion_intensity: 4
visual_density: 3
---

# Launch Control. Design language (LOCKED)

Rewritten 2026-10-07 to Eris's direction of 2026-10-06/07. It replaces the 2026-10-03
ember / Barlow / tachometer identity in full. The source of truth for values is
`web/src/styles/tokens.css`; this file says why, and where each value is allowed.

Every screen must read as the same product if placed side by side.

## Design read

A website for professional clientele. A visitor sees a business first: a clear headline, what we
build, proof, a way to book. The V8 is a quiet animation in the background, like a background
video: dim, slowly turning and pulling apart as the page scrolls, with type sitting over it.

In his words (2026-10-07): "The engine doesn't need to be the main attraction. It's not a website to
show off animation of the engine. It's a website for professional clientele. I just want the
animation in the background somehow... the words can overlap the engine if it's in the background."

## Hard exclusions

- No click-to-enter gate, no scroll-locked engine sequence, no engine sound. The page scrolls
  normally from the first paint.
- Never reframe, brighten or clear space for the engine. Type overlaps it.
- No bloom, light rays or launch flash by default (`?fx=` turns them on only for comparison).
- Orange and red never carry a surface and never lead: yellow leads, so it never reads as Hyper
  Racer's black-and-orange.
- No `backdrop-filter` over the canvas. No glass panels, gradient text, card grids, fake logo rows.

## Signature

**The livery stripe.** A short 3px bar, yellow / orange / red in the car's proportions (5:3:2), under
the hero eyebrow and above every section title on dark ground. Second beat: silver Michroma type,
the same metal as the engine, and the full yellow Book a launch panel.

## Color (locked)

Neutral blacks and silvers, no hue tint. Jordan yellow leads; Jordan orange and red (all three sampled
from the B&H Jordan 199 livery photo) are small accents. Dark only, by brief.

| role | hex | use |
|---|---|---|
| background | #050607 | page ground, canvas clear colour |
| surface | #0b0d10 | content panels, the nav once content is under it |
| elevated | #15181c | form fields, hover rows |
| border | #262b31 | hairline rules (decorative only) |
| text | #f4f6f8 | body copy, headings on panels |
| **steel** | #c6ccd3 | display type: captions, section titles, the wordmark |
| muted | #a7adb4 | secondary copy, nav items |
| subtle | #7a8189 | small print, footer credits, control borders, placeholders |
| **ember (accent)** | #f0c419 | THE accent, Jordan yellow. Start ring, Book panel, primary button, the nav CTA, combustion heat |
| ember-hot | #f07d1a | Jordan orange: livery stripe, heat ramp stage 2. Never a surface |
| ember-red | #e3261d | Jordan red: livery stripe, heat ramp stage 3. Never a surface |
| white-hot | #ffffff | lab page only |
| danger | #e3261d | invalid-field borders. Never body text (fails AA) |
| success / warning / info | #8fd49a / #f0c419 / #9ec5e8 | form sent / hints / notices |

`--color-ember` keeps its name for the many call sites; it is Jordan yellow. The engine's combustion
glow runs the livery ramp, yellow → orange → red, at background strength.

Proportion: background and surface carry ~90% of the page, steel/text ~8%, yellow ≤2% outside the
Book panel (eyebrows, the nav CTA and the primary button; counters, dashes and role labels are
steel), orange and red only inside the stripe and the engine's faint glow.

### Contrast (WCAG 2.2 AA, measured 2026-10-07)

| pair | on background | on surface | on elevated |
|---|---|---|---|
| text | 18.72 | 17.96 | 16.44 |
| steel | 12.53 | 12.03 | 11.01 |
| muted | 8.96 | 8.60 | 7.87 |
| subtle | 5.15 | 4.94 | 4.52 |
| ember (yellow) | 12.18 | 11.69 | 10.70 |
| danger | 4.40 | 4.23 | 3.87 |
| border | 1.42 | 1.36 | 1.25 |

Ink on the yellow panel: background on ember 12.18. Orange and red are decorative only (stripe, glow).

Rules from the ratios:
- `subtle` was #6c737b (4.05 on surface, failed AA for the 13px footer); raised to #7a8189 on
  2026-10-07. Any change to a ground re-measures this table in the same commit.
- `danger` passes 3:1 for non-text (borders, the ring) but not 4.5:1 for text. Error *text* on
  the yellow panel is `background` ink (`.field-error`); red on yellow is 2.77 and is banned.
- `border` is decorative only. Interactive control borders use `subtle`.

## Type (locked)

| role | family | use | notes |
|---|---|---|---|
| headlines | Sora 600 | h1 to h4, sentence case | tracking -0.015em, line-height 1.1, colour `steel`. Changed 2026-10-08: all-caps Michroma headlines were the outlier against the five reference agencies (docs/review/agency-refs-2026-10-08); 4 of 5 set headlines in sentence case in one sans |
| signage | Michroma 400 | wordmark, client names, button labels, the 404 code | uppercase, tracking 0.14em at ≤15px. Never a headline |
| body | Sora 400/500 | reading copy, 16 to 18px minimum | measure ≤ 65ch, 1.55 line-height |
| utility | Chivo Mono 400/500 | labels, nav items, form labels, footer credits | uppercase labels at 0.14em |

Self-hosted through `next/font`, `display: swap`. Fallbacks: Eurostile / Bank Gothic / Arial for
Michroma, Arial for Sora, Menlo for Chivo Mono. Barlow, Barlow Condensed and IBM Plex Mono are out.

Sizes are tokens: caption 13px, body clamp(0.95–1.06rem), lead, title, `caption-3d`
clamp(1.25–2.2rem) (lab only), display clamp(1.75–3.4rem) for section titles, hero clamp(1.9–4rem)
for the one h1.

## Scales (locked)

spacing: 4px base. Section rhythm uses `section-sm 96 · section-md 128 · section-lg 192`.
Content max width 1200px.
radius: `none 0 · hairline 2 · round 9999`. Everything on the page is square.
shadow: none. Depth comes from the 3D scene, the backdrop glow and bloom.
motion: `fast 120 · base 300 · emphasis 600` ms, UI easing `cubic-bezier(0.16, 1, 0.3, 1)`.
No bounce, no elastic. Camera timing over scroll is a monotone cubic over arc length (never
piecewise-linear; Eris called that "amateur"). The turntable turns with time only; scroll owns the
camera. Shake is faint.
z-layers: `canvas 0 · content 10 · hud 30 · tach 40 (unused) · gate 50 · toast 70 · skipLink 80`.

## The engine (background rules)

- Fixed full-viewport canvas behind the whole page at 0.8 opacity, fading in when its first frame
  is drawn. The hero is real HTML and never waits for it.
- Right of centre on landscape (`ENGINE_OFFSET_X 0.22`), the same camera on every screen. On a
  phone the type simply sits over it.
- Its scroll timeline (`scrollMap`) spans the whole page: a gentle pull-apart and back, revs held
  between 800 and 2200, combustion glow at `BACKGROUND_HEAT 0.55`. Full disassembly
  (`EXPLODE_AMPLITUDE 1`): apart from 5% to 45% of the page, back together by 90%.
- Drag on the hero rotates it (buttons and links are excluded). Pistons always run.
- Content panels are `background` at 60%, so the engine stays faintly visible behind every section.

## Layout vocabulary (allowed families)

Order of the page (from the reference agencies): hero → client logo row → work with real
screenshots → what we build and run → team → book → footer. Work always comes before services.
CRM screens are real admin captures from a local instance seeded with invented leads, captioned as
such; production data never appears.

0. Work: every product screen is captured twice at 2x density, a 1280x800 desktop view
   (2560x1600) and a 390x844 phone view (1170x2532), webp q90, served at quality 90 with `sizes`
   matching the slot. A desktop page squeezed into a phone or a half-width frame is unreadable
   whatever its resolution, so the page shows the desktop capture in a browser frame from `sm` up
   and the real phone capture in a phone frame below it. Each project gets a browser-framed hero
   shot with a phone shot overlapping its bottom-left corner, the client name in mono above, a
   sentence-case title, a summary, Visit site. Further screens (the CRM, a phone-first app) go in
   the screen viewer (`ScreenViewer`): one frame, a list of the screens with a one-line note each,
   previous / next arrows and a `01 / 03` counter; the frame crossfades. Nothing scrolls sideways
   and nothing bleeds past the column (Eris, 2026-10-09: no sliding, no peek). Desktop captures:
   the list runs above the frame as three ruled columns and the frame fills the column. Phone-only
   captures: the project's copy and the list share the left column, one phone frame on the right.
   The active row carries a 2px yellow left bar; the counter is steel.
   Only public pages or demo screens with invented data; never client data.
1. Hero: stripe, mono eyebrow, one h1 (≤ 17ch), one lead sentence, primary + secondary button,
   left-aligned over the engine with a left-to-right scrim (90% at the edge, 50% at the end of
   the text column, clear on the right) so the engine stays bright beside the copy, dim behind it.
2. Ruled editorial panels: What we build and run (six numbered cells, `text-title` headings over
   `text-body`), Team. 5/7 split for every title + lede, hairline dividers, no cards. Sections use
   `py-16 lg:py-20`; the featured project shows the collage, the agents' three guarantees and the
   CRM row (no feature diagram, no stack line: they restated the services grid).
3. The yellow panel: Book a launch, full-bleed `ember` with `background` ink, ≤4 fields.
4. Footer: mono utility block with the engine model's CC BY credit.

Nav: wordmark left, ≤4 items, the last (Book a launch) the only yellow item, drawn as a small
outlined yellow button. Below `sm` the bar is wordmark + Menu; the Menu opens a solid panel under
the bar listing every item (Book a launch last, yellow). Transparent at the top of the hero, solid
`surface` with a hairline once the page scrolls. Never backdrop-filter.

## Voice

Plain, confident, mechanical. Short sentences, verbs first, no buzzwords, no em-dashes in visible
copy. CTA flow: "Book a launch" → "Booking" → "Booked". Numbers only when real. All copy lives in `web/src/content/site.ts`.
