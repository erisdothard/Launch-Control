# Launch Control

**Business development & growth systems.** Powered by Syntra AI.

> You've got the car. We're the pit wall.

Marketing site for Launch Control. It doubles as the portfolio and the sales tool: every inquiry
from the contact form lands in our own Launch Control CRM.

## Brand: the timing sheet

Full system: **`brand/index.html`**.

- **Idea:** Launch Control is the pit wall. The pit wall runs on paper and a board: lap times on a
  sheet, one message on black tiles held over the wall. The brand is those two objects.
- **Mark:** a pit board. Two tiles read LC; the dashed row is the empty message slot; one flag tile. `assets/mark.svg`.
- **Device:** the board, and it works. `js/board.js` renders letter tiles; the masthead board flips
  to name the section in view (`data-board` on each sheet). `[data-board-static]` renders tiles once.
- **Type:** Big Shoulders 900 headlines (signage), Source Serif for reading, JetBrains Mono on boards.
  All self-hosted in `assets/fonts/` (OFL).
- **Colour:** Paper `#F4F2EC`, Sheet `#EBE8DF`, Ink `#141311`, Flag `#E4572E` (one signal, never a ground).
- **Voice:** the pit wall tells the driver what's happening and what to do next. Short. Numbers over adjectives.

## The Engine (WebGL)

One fixed Three.js canvas behind the content. A V8 floats exploded in the hero and **assembles as you
scroll**; the scrollbar is the playhead, nothing hijacks native scroll. At the end it fires.

- `js/engine.js`: procedural V8 with real detail (cast block with ribs and bolt bosses, finned cam covers,
  I-beam rods, lathe-profiled pulleys and velocity stacks, volute turbo) in nine named part groups, each
  seating inside its own scroll window. Authored camera keyframes (`SHOTS`). Studio lighting: hard key with
  shadows, volt rim, depth of field, vignette, grain. Hover a part for a board naming the service it stands for.
- **Drop in a modelled GLB:** name its top-level nodes after `PART_ORDER` and set `MODEL_URL`. Draco decoder
  is vendored.
- Lit for a light bench: warm key with shadows, shadow-catcher floor, paper fog. Phones (<=900px) and
  `?nogl` get the sheet alone: copy spans the full width there, so the engine stays off.
- Three.js vendored in `assets/vendor/` and resolved through an import map. No CDN, no build step.

## Conversion layer

- One CTA everywhere: **Book a 20-min pit stop**. Set `BOOKING_URL` in `js/main.js`. Empty = scroll to form.
- Sticky CTA from the services beat until the form is on screen.
- Form posts JSON to `CRM_ENDPOINT` (`js/main.js`); honeypot included. Copy follows the voice rules.
- Proof strip in the hero and the Proof beat share the same `data-count` numbers.

## Structure

```
index.html                    Home (eight beats over the engine)
brand/index.html              Brand system
js/board.js                   The pit board (live + static tiles)
assets/og-src.html            Source for assets/og.png (render at 1200x630)
case-studies/hyper-racer.html Case study (static)
css/styles.css                All styles (tokens in :root, board device at the bottom)
js/engine.js                  WebGL engine
js/main.js                    Nav, HUD ticker, reveals, counters, booking buttons, lead form
assets/mark.svg               The mark
assets/vendor/                three.js + addons (MIT, see THREE-LICENSE)
```

Plain HTML/CSS/JS. Serve over HTTP (ES modules don't load from `file://`). Deploy to Netlify, Vercel,
Cloudflare Pages or GitHub Pages.

```bash
python3 -m http.server 8000   # http://localhost:8000
```

## TODO

- [ ] `BOOKING_URL` in js/main.js
- [ ] Real numbers: `data-count` values in index.html and the case study
- [ ] Case study `[TODO]` copy, or anonymise/remove Hyper Racer if that changes
- [ ] Modelled engine GLB via `MODEL_URL`
- [ ] Trademark check on "Launch Control" (a Tampa SaaS uses the name)
- [ ] Analytics
