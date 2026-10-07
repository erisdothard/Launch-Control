---
project: Launch Control
register: brand
aesthetic_direction: industrial / signage
color_strategy: restrained
design_system: bespoke
design_variance: 8
motion_intensity: 9
visual_density: 4
---

# Launch Control. Design language (LOCKED)

Every screen must read as the same product if placed side by side.

## Design Read

Hold the revs, then let go. A cold steel block that gets hot. Engine bay, not showroom.

The bet: every automotive site is black with a red accent and a glossy car. We skip the car entirely.
The product is the engine, shown from inside, and the only colour on the page is heat.

## Counterfactual default test

For any car brief the reflex answer is "dark luxury": black, red accent, serif, glossy hero. That is
Rimac, that is every supercar page. We reject it. Industrial signage is chosen because the subject is
an engine bay: stencil type, gauge faces, data plates, telemetry. Nothing on this page is shiny.

## Signature

**The tachometer.** One RPM gauge needle, fixed at the viewport edge, is the site's scroll progress
indicator and navigation. It climbs through the ignition sequence, hits redline at the launch beat,
then idles through the content sections. It replaces the generic progress bar and dot nav. Nothing
else on the page is allowed to compete with it. The engine-start button at the gate is the
tachometer's trigger, not a second signature.

## Inspiration (visited and screenshotted 2026-10-03, board at docs/inspo/)

| source | took | rejected |
|---|---|---|
| Oryzo (oryzo.ai) | one hero object held in frame, camera dives on scroll, warm near-black ground | the warm brown tint (ours is steel-cold until heat arrives) |
| Igloo Inc (igloo.inc) | fog volume, emissive object as the only light source | monochrome grey ground, cold throughout |
| Hubtown (hubtown.co.in) | emissive core with bloom as the focal point | blue glow (banned AI-blue family), lake reflection |
| Rimac (rimac-automobili.com) | tracked uppercase display type, cinematic restraint, one accent | black + red automotive default, the car itself |
| Shopify Editions S26 | particle dissolve into a light streak as a transition beat | pastel particle colours, white UI below |
| Lusion (lusion.co) | numeric preloader counter as a gauge | fluid-sim playfulness |
| Bruno Simon | a gate before the experience, "click to start" | game aesthetic |
| iyO One | scroll-scrubbed exploded product view | product-marketing white sections |

Synthesis: Oryzo's structure, Igloo's atmosphere, Hubtown's single light source, Shopify's launch beat,
with an industrial-signage skin none of them use. It is not a reskin of any one of them.

## Color (locked)

Neutrals are tinted toward cold steel (hue 250). The one accent is heat (hue 55) and it ramps hotter
as the engine does. Light mode: none. This product is dark only, by brief.

| role | OKLCH | hex | use |
|---|---|---|---|
| background | oklch(13% 0.010 250) | #05080b | page ground, canvas clear colour |
| surface | oklch(17% 0.012 250) | #0b1015 | content sections, panels |
| elevated | oklch(22% 0.014 250) | #161b21 | hover rows, form fields |
| border | oklch(30% 0.014 250) | #292e35 | hairline rules (decorative only) |
| text | oklch(95% 0.006 250) | #ebeff2 | headlines, body |
| muted | oklch(72% 0.012 250) | #9fa5ac | secondary copy, labels |
| subtle | oklch(56% 0.014 250) | #6e757d | captions, telemetry idle, control borders |
| **ember (accent)** | oklch(74% 0.170 55) | #fa8927 | the ONE accent: tach needle, start ring, links, primary button |
| ember-hot | oklch(88% 0.120 75) | #ffcc79 | heat ramp stage 2, redline region, used only inside the ignition sequence |
| white-hot | oklch(99% 0.010 75) | #fffbf5 | heat ramp stage 3, the launch flash only. Never as a UI colour |
| success | oklch(74% 0.14 150) | #62c37a | form sent |
| warning | oklch(80% 0.15 85) | #eab532 | validation hints |
| danger | oklch(62% 0.21 28) | #ea3d35 | errors |
| info | oklch(72% 0.10 230) | #5bb0d7 | system notices |

Heat ramp: ember → ember-hot → white-hot is a scripted gradient driven by RPM, used only by the
3D scene and the tachometer. UI chrome never uses ember-hot or white-hot.

60-30-10: background and surface carry ~85% of the page, text/muted ~10%, ember ≤5%.

Contrast (WCAG AA, computed 2026-10-03):

| pair | ratio |
|---|---|
| text on background | 17.36 |
| muted on background | 8.08 |
| subtle on background | 4.31 (small text passes AA 4.5? No. Use subtle for ≥18px/14px-bold only, or captions on surface at 4.10 as large text) |
| ember on background | 8.29 |
| background on ember (button label) | 8.29 |
| text on surface | 16.52 |
| danger on background | 4.99 |
| success / warning / info on background | 9.18 / 10.66 / 8.26 |
| border on background | 1.47 (decorative hairlines only; interactive control borders use subtle at 4.31, passes 3:1) |

Rule from the ratios: `subtle` is never used for body-size copy. Captions in subtle are 14px semibold
or larger.

## Type (locked)

| role | family | use | notes |
|---|---|---|---|
| display | Barlow Condensed 700/800 | headlines, the gate, section titles | uppercase, tracking -0.01em at ≥64px, 0.04em at ≤24px (signage spacing). Clamp 2.5rem to 9rem |
| body | Barlow 400/500 | reading copy | measure 60 to 70ch, 1.55 line-height |
| utility | IBM Plex Mono 400/500 | telemetry readouts, RPM digits, labels, form field labels, footer | tabular numerals, uppercase for labels at 0.08em tracking |

Pairing axis: width. Barlow Condensed against Barlow is one superfamily in two widths, which is the
"one family in multiple weights" rule applied to width. Plex Mono is the contrast face for data.
Barlow is derived from Californian public-sign and traffic typography, which is the signage brief.
Two families total. Self-hosted, `font-display: swap`, metric-matched fallbacks: Arial Narrow for
Condensed, Arial for Barlow, Menlo for Plex Mono.

Banned here by the anti-slop list and not used: Inter, Space Grotesk, Fraunces, Playfair.

## Scales (locked)

spacing: 4px base. `0 2 4 8 12 16 24 32 48 64 96 128 192` px. Section rhythm uses 96/128/192 only.
radius: `none 0 · hairline 2 · round 9999`. `round` is reserved for the engine-start button and the
tachometer face. Every other element is square. Engines do not have rounded cards.
shadow: none. Depth comes from the 3D scene, fog, and bloom, never from CSS drop shadows.
motion: durations `fast 120 · base 300 · emphasis 600` ms. UI easing `cubic-bezier(0.16, 1, 0.3, 1)`.
Scroll-scrubbed motion is linear by definition (scrub: true). Exit is 75% of enter. No bounce, no
elastic, anywhere. `prefers-reduced-motion`: the ignition sequence is replaced by a single still
render with the same copy, the tachometer becomes a static progress rule, and the gate becomes a
plain "Enter" button.
breakpoints: `sm 640 · md 768 · lg 1024 · xl 1280 · 2xl 1536`. Content max width 1200px.
z-layers: `canvas 0 · content 10 · hud 30 · tach 40 · gate 50 · toast 70 · skipLink 80`.

## Layout vocabulary (allowed families)

1. Gate: one object centred on empty ground. Allowed once, as the entry gate only.
2. Pinned stage: full-bleed canvas with a HUD of mono telemetry anchored to the four corners.
3. Ruled editorial columns: 2-col, hairline rules, asymmetric 5/7 split.
4. Horizontal stage strip: the four-stage sequence, scrolls sideways, each stage a full column.
5. List with dividers: proof/work entries, no cards.
6. Stat strip: real values only, mono digits.

Banned on this project: three equal cards, nested cards, glass panels, gradient text, centred hero
over a gradient mesh, decorative status dots, fake logo rows.

## Voice

register: plain, confident, mechanical. Short sentences. Verbs first. No buzzwords from the
anti-slop list. No em-dashes in any visible copy.
action vocabulary: Start → Running → Launch. CTA flow: "Book a launch" → "Booking" → "Booked".
Numbers: only real ones. If a number cannot be sourced, it is not on the page.
