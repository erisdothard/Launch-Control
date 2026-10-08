---
project: Launch Control
register: brand
aesthetic_direction: sleek automotive / dark luxury, steel and canary
color_strategy: restrained
design_system: bespoke
design_variance: 7
motion_intensity: 7
visual_density: 3
---

# Launch Control. Design language (LOCKED)

Rewritten 2026-10-07 to the direction Eris set on 2026-10-06. It replaces the 2026-10-03
ember / Barlow / tachometer identity in full. The source of truth for values is
`web/src/styles/tokens.css`; this file says why, and where each value is allowed.

Every screen must read as the same product if placed side by side.

## Design read

Sleek and sexy. A black room, one steel engine turning slowly in it, silver type cut from the same
metal, one canary-yellow accent. The engine is atmosphere, not the main attraction: it sits behind
the words and never competes with them.

In his words: "sleek and sexy", "not trying to show off the engine as the main attraction",
"black, white, silver, canary yellow", "the steel color of that engine needs to be the same color
of the font".

## Hard exclusions

- **No orange, and never black-and-orange.** That is Hyper Racer's identity. This includes the
  combustion glow, which is canary.
- No tachometer, no gauge, no telemetry readouts, no RPM digits. Captions are the only HUD.
- No `backdrop-filter` over the canvas (it kills the compositor on this site). Solid fills only.
- No shiny gradients, glass panels, gradient text, card grids, decorative status dots, fake logo rows.

## Signature

**Silver type, same metal as the engine.** Display type is Michroma in `steel` (#c6ccd3), the colour
the engine's steel reads at under the studio lighting. The caption and the engine read as one
object. Second beat: the canary **Book a launch** panel, the only full-bleed colour on the page.

## Color (locked)

Neutral blacks and silvers, no hue tint. One accent: canary (sampled from the B&H Jordan 199 livery).
Dark only, by brief.

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
| ember-hot | #ffe680 | heat ramp stage 2, pale hot yellow, inside the engine's combustion only, never UI |
| white-hot | #ffffff | heat ramp stage 3, the ignition flash only, never UI |
| danger | #e3261d | the igniting ring and invalid-field borders. Never body text (fails AA) |
| success / warning / info | #8fd49a / #f0c419 / #9ec5e8 | form sent / hints / notices |

`--color-ember` keeps its name for the many call sites; it is the yellow accent. The heat ramp is
yellow → pale yellow → white. No stage of it is orange (ember-hot was #f07d1a until 2026-10-07).

Proportion: background and surface carry ~90% of the page, steel/text ~8%, canary ≤2% outside the
Book panel.

### Contrast (WCAG 2.2 AA, measured 2026-10-07)

| pair | on background | on surface | on elevated |
|---|---|---|---|
| text | 18.72 | 17.96 | 16.44 |
| steel | 12.53 | 12.03 | 11.01 |
| muted | 8.96 | 8.60 | 7.87 |
| subtle | 5.15 | 4.94 | 4.52 |
| ember | 12.18 | 11.69 | 10.70 |
| danger | 4.40 | 4.23 | 3.87 |
| border | 1.42 | 1.36 | 1.25 |

Ink on the canary panel: background on ember 12.18.

Rules from the ratios:
- `subtle` was #6c737b (4.05 on surface, failed AA for the 13px footer); raised to #7a8189 on
  2026-10-07. Any change to a ground re-measures this table in the same commit.
- `danger` passes 3:1 for non-text (borders, the ring) but not 4.5:1 for text. Error *text* on
  the canary panel is `background` ink (`.field-error`); red on canary is 2.77 and is banned.
- `border` is decorative only. Interactive control borders use `subtle`.

## Type (locked)

| role | family | use | notes |
|---|---|---|---|
| display | Michroma 400 (only weight) | captions, section titles, wordmark, button labels | uppercase, wide; tracking 0.05em display, 0.14em signage at ≤15px |
| body | Sora 400/500 | reading copy | measure ≤ 65ch, 1.55 line-height |
| utility | Chivo Mono 400/500 | labels, nav items, form labels, footer credits | uppercase labels at 0.14em |

Self-hosted through `next/font`, `display: swap`. Fallbacks: Eurostile / Bank Gothic / Arial for
Michroma, Arial for Sora, Menlo for Chivo Mono. Barlow, Barlow Condensed and IBM Plex Mono are out.

Sizes are tokens: caption 13px, body clamp(0.95–1.06rem), lead, title, `caption-3d`
clamp(1.25–2.2rem) for the hero captions, display clamp(1.75–3.4rem).

## Scales (locked)

spacing: 4px base. Section rhythm uses `section-sm 96 · section-md 128 · section-lg 192`.
Content max width 1200px.
radius: `none 0 · hairline 2 · round 9999`. `round` is the engine-start button only. Everything
else is square.
shadow: none. Depth comes from the 3D scene, the backdrop glow and bloom.
motion: `fast 120 · base 300 · emphasis 600` ms, UI easing `cubic-bezier(0.16, 1, 0.3, 1)`.
No bounce, no elastic. Camera timing over scroll is a monotone cubic over arc length (never
piecewise-linear; Eris called that "amateur"). The turntable turns with time only; scroll owns the
camera. Shake is faint.
z-layers: `canvas 0 · content 10 · hud 30 · tach 40 (unused) · gate 50 · toast 70 · skipLink 80`.

## The engine (atmosphere rules)

- Landscape: right of centre (`ENGINE_OFFSET_X 0.22`), about 55% of the viewport height, behind the
  caption column on the left.
- Portrait (phones, upright tablets): centred, pulled back and dropped into the lower part of the
  frame (`portraitAmount` in CameraRig, 0 at aspect ≥ 1, 1 at ≤ 0.5). The caption moves to a top
  band under the nav. Type never sits on steel.
- Darker steel, a gentle pull-apart (`EXPLODE_AMPLITUDE 0.4`), pistons always running.
- Revs are held, never pinned: idle 800, rebuild 1500, hold 2200, limiter 2200 to 2500, launch back
  to 800. Audio pitch is sub-linear, (rpm/800)^0.55.
- Drag (mouse or touch) rotates the engine about its centre.
- After the launch the canvas stays behind the content at 0.5 opacity. The engine never leaves.

## Layout vocabulary (allowed families)

1. Gate: the round ENGINE START button centred on black. Once, as the entry only.
2. Stage: 500svh of fixed full-bleed canvas, one caption per beat, nothing else on screen.
3. Steel panels: Build, Proof, footer as solid `surface` panels sliding over the dimmed canvas,
   ruled lists with hairline dividers, no cards.
4. The canary panel: Book a launch, full-bleed `ember` with `background` ink, ≤4 fields.

The sequence strip and the Arrival section were removed on 2026-10-06 and stay out.

Nav: wordmark left, ≤4 items, the last (Book a launch) the only canary item. Transparent over the
stage, solid `surface` from the moment the raw scroll leaves the stage. Never backdrop-filter.

## Voice

Plain, confident, mechanical. Short sentences, verbs first, no buzzwords, no em-dashes in visible
copy. Action vocabulary: Start → Running → Launch. CTA flow: "Book a launch" → "Booking" →
"Booked". Numbers only when real. All copy lives in `web/src/content/site.ts`.
