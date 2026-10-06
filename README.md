# Launch Control

**Business development & growth systems.** Powered by Syntra AI.

> You've got the car. We're the pit wall.

Marketing site for Launch Control. It doubles as the portfolio and the sales tool: every inquiry
from the contact form lands in our own Launch Control CRM.

## Brand

Full system: **`brand/index.html`** (mark, lockups, the board device, type, colour, voice, card and banner).

- **Idea:** Launch Control is the pit wall. The pit wall talks to the car with a board. Everything is a board.
- **Mark:** a pit board with the top-right corner cut at the moment of release; the L's foot runs the
  full width (the wall); one letter slot (the message). `assets/mark.svg`, also the favicon.
- **Device:** the board. Black plate, volt message, grey label, release cut. Every stat, label and tag.
- **Type:** Syne 800 headlines; one phrase per headline turns Instrument Serif italic in volt; Inter body;
  JetBrains Mono on boards.
- **Colour:** Carbon `#050505`, Board `#0D0D0F`, Volt `#C8FF00` (the message, never the ground), Chalk `#F2F2EF`.
- **Voice:** the pit wall doesn't hype. Short, specific, numbers over adjectives, full stops.
- **Test:** `index.html?nogl` renders the site with the engine off. The brand has to hold there first.

## The Engine (WebGL)

One fixed Three.js canvas behind the content. A V8 floats exploded in the hero and **assembles as you
scroll**; the scrollbar is the playhead, nothing hijacks native scroll. At the end it fires.

- `js/engine.js`: procedural V8 with real detail (cast block with ribs and bolt bosses, finned cam covers,
  I-beam rods, lathe-profiled pulleys and velocity stacks, volute turbo) in nine named part groups, each
  seating inside its own scroll window. Authored camera keyframes (`SHOTS`). Studio lighting: hard key with
  shadows, volt rim, depth of field, vignette, grain. Hover a part for a board naming the service it stands for.
- **Drop in a modelled GLB:** name its top-level nodes after `PART_ORDER` and set `MODEL_URL`. Draco decoder
  is vendored.
- Reduced-motion gets a still; no WebGL gets the brand without the engine. Mobile: tighter explode, no post.
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
- [ ] Self-host the four fonts
- [ ] Trademark check on "Launch Control" (a Tampa SaaS uses the name)
- [ ] Open Graph image (use the banner from the brand sheet), analytics
