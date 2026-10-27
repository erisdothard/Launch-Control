# Launch Control

3D scrollytelling marketing site. Pressing ENGINE START turns over a V8; scroll dives through the
engine (cutaway, combustion, revs to the limiter) and the page launches into the content sections.
Business assumption (approved "close enough" 2026-10-03): a launch service taking a business from
zero to launched. Its positioning overlaps Syntra (syntraai.tech); confirm the relationship before
rewriting copy.

## Layout

- `web/` Next.js 16 App Router app (pnpm, `src/`, Tailwind v4). Read `web/AGENTS.md` and the bundled
  docs in `web/node_modules/next/dist/docs/` before writing App Router code; this Next version
  differs from training data.
- `.ulpi/design/DESIGN.md` locked design language. `.ulpi/design/ignition-site.md` feature spec.
  Every colour, font, radius and duration must come from DESIGN.md. Re-read it before UI work.
- `docs/PLAN.md` architecture and phases. `docs/inspo/` reference board. `docs/review/` visual-gate captures.
- `tools/blender/` engine asset pipeline (inspect_engine.py, decimate.py, rig_bake.py, export.sh).
- `assets-src/` large source assets, git-ignored.

## Commands (run in `web/`)

Node 22 is required (`.node-version`); vitest 5 breaks on Node 20. If the shell default is 20,
prefix with `fnm exec --using=22`.

```bash
pnpm dev          # http://localhost:3100. Port 3000 belongs to another project; never use or kill it.
pnpm typecheck
pnpm lint
pnpm test         # vitest unit tests (engine kinematics, scroll map)
pnpm test:e2e     # Playwright, reuses the server on 3100
```

Debug URL params: `?debug` exposes `window.__lc.{setProgress,freezeTime,info}`; `?engine=placeholder|glb`;
`?fx=high|mid|low|off`; `?skip` bypasses the gate.

## Architecture rules

- ONE render loop: `src/lib/loop.ts` on `gsap.ticker` runs Lenis → ScrollTrigger → scrollState → R3F
  `advance`. The Canvas is `frameloop="never"`. Never add a second RAF or a non-zero `useFrame` priority
  (it silently takes over rendering).
- Per-frame values live in the mutable `scrollState` object, never React state.
- Crank angle is integrated (`phase += rpm * dt`), never scrubbed.
- Engine parts are driven by name through `src/lib/engine/engineContract.ts`. The placeholder and the
  glb must expose the same nodes.
- ALL copy lives in `src/content/site.ts` (zod-validated). Components contain zero literal strings.
- No `backdrop-filter` over the canvas. No `* { margin:0; padding:0 }`. No `cache: 'force-cache'`.
- Version asset filenames (`engine-v2.glb`); never overwrite an asset in place.

## Quality gates

- Visual changes: screenshot with Python Playwright (SwiftShader flags) via `__lc.setProgress`, compare
  against `docs/inspo/`, and run the consensus-reviewer before showing anything. Measure pixels when
  a heat or exposure ramp is disputed; camera distance confounds intensity.
- Memory: renderer RSS (not JS heap) flat across 3 full scroll loops.
- Credits: CC BY credits for the engine model and the audio stay in the footer.

## Open

- Real engine asset (Track A). Source files exist in `assets-src/`; part separation and assembly not yet
  verified by this repo's pipeline.
- Lighthouse, tablet/mobile e2e, real-device test, Vercel deploy with live-URL verification.
- Vercel (team syntra-ai): one project per app from this repo, Root Directory `web` (golaunchcontrol.com)
  and `crm` (crm.golaunchcontrol.com). Deploy state shows on GitHub commit statuses.
