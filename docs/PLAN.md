# Launch Control. Build plan

Generated 2026-10-03 from the planner pass. Design language: `.ulpi/design/DESIGN.md`. Feature spec:
`.ulpi/design/ignition-site.md`. References: `docs/inspo/`.

## Architecture

### Single RAF loop
- `<Canvas frameloop="never">`. R3F never owns a requestAnimationFrame.
- `web/src/lib/loop.ts` registers ONE `gsap.ticker` callback, fixed order:
  1. `lenis.raf(time*1000)`
  2. `ScrollTrigger.update()`
  3. `scrollState` write
  4. R3F `advance(time)` via a `<Driver/>` inside the Canvas
- `gsap.ticker.lagSmoothing(0)`. Strict-mode-safe teardown. Canvas paused (not disposed) when the hero is off-screen.
- Scrub smoothing comes from Lenis `lerp` only; ScrollTrigger uses `scrub: true`.

### Scroll state is a mutable object, not React state
- `web/src/lib/scrollState.ts`: `{ p, rpm, phase, launch, ignition }`. GSAP writes, `useFrame` reads. Zero React re-renders per frame in the hero.

### One master timeline
- One ScrollTrigger pins `#hero`, `end: "+=600%"`. Scroll map in `web/src/lib/scrollMap.ts`:

| p | beat |
|---|---|
| 0.00 to 0.08 | Idle. Engine rim-lit in black, camera far |
| 0.08 to 0.35 | Dolly along a CatmullRom path to the V-bank. Pistons visible, exploded-view hint opens |
| 0.35 to 0.55 | Cylinder cutaway (clipping plane), combustion flashes, light rays |
| 0.55 to 0.85 | RPM scrubs to the limiter. Exhaust fog, distortion, camera shake build |
| 0.85 to 0.92 | Limiter: fuel-cut stutter, hold |
| 0.92 to 1.00 | Launch: engine dissolves to points, points stretch to streaks, white-out reveals the DOM |

### Crank angle is integrated, not scrubbed
- `phase += rpm(p) * dt`. Scrolling back slows the engine, never rewinds it.
- Firing order 1-8-4-3-6-5-7-2 over 720°, held in the engine contract.

### Engine rig interface
- `EngineRig.setCrankAngle(rad)`, two implementations: baked glTF clip sampling, or runtime slider-crank kinematics `y = r·cosθ + √(l² − r²sin²θ)`. Both read the same node-name contract so placeholder and real model are interchangeable. Runtime kinematics is primary.

### Gate state machine
`loading → ready → igniting → idle → scrolling → launched` in `web/src/lib/phase.ts` (vanilla store, `useSyncExternalStore`).
- First paint: server-rendered black page, real `<button>` as LCP. 3D chunk dynamically imported `ssr:false`. Button shows a 000→100 load counter. Press before load completes queues ignition.
- Gate lock: `lenis.stop()`, `html{overflow:hidden}`, `scrollRestoration='manual'`. Skip link and `#hash` deep links bypass the gate.
- Press: time-based GSAP ignition timeline (starter cranks, fire, rpm 0→800 idle). Same gesture unlocks AudioContext if audio is approved.
- Handoff: `scrollTo(0,{immediate:true})`, `lenis.start()`, phase `idle`. Scroll p=0 equals idle rpm; camera and crank carry over with no jump.
- Launch: last 8% is scrubbed, reversible.
- After launch: canvas opacity 0, loop stops advancing. Scrolling back resumes.

### RSC and DOM split
- `web/src/app/page.tsx` is a server component rendering content sections as real HTML from the content file (SEO, a11y).
- `<Experience/>` (client) holds Canvas, gate, hero captions.

### UI layer
- Framer Motion for gate button, nav, section reveals only. No scroll-linked hero motion through Framer.
- No `backdrop-filter` over the canvas. Nav gets a solid fill.

### Shaders (`web/src/shaders/*.glsl`, raw strings)
- Fog: layered camera-facing noise billboards, depth-faded. Not raymarched.
- Light rays: additive cone and billboard shells with animated noise.
- Distortion: one postprocessing `Effect`: chromatic aberration, radial warp, grain, driven by `uRpm`.
- Combustion: emissive flash material + point lights. Bloom via pmndrs `postprocessing`, one merged pass.
- Launch morph: points sampled from the engine surface with `MeshSurfaceSampler`, vertex shader lerps `position → streak` by `uLaunch`. 120k desktop, 35k mobile.

### Content
- ONE file, `web/src/content/site.ts`, zod-validated at build. Gate label, load text, hero captions per beat, sections, nav, SEO, Sketchfab CC BY credit, skip-intro label. Components contain zero literal copy.

## Phases

**Phase 0. Foundations (PR1)**
- Verify scaffold, install: gsap, lenis, three, @react-three/fiber, drei, postprocessing, @react-three/postprocessing, framer-motion, zod, @gltf-transform/cli (dev), detect-gpu, @playwright/test.
- `web/src/content/site.ts` + schema.
- `web/src/lib/engine/engineContract.ts`: nodes `Crank`, `Cyl_{1..8}_Piston`, `Cyl_{1..8}_Rod`, `Block`, `HeadL`, `HeadR`; params bank 90°, stroke, rod length, bore, throw angles, firing order.
- Tailwind v4 tokens in `web/src/styles/tokens.css` from DESIGN.md. Only `box-sizing` on `*`.

**Parallel tracks after Phase 0**

**Track A. Engine asset pipeline (Blender MCP, PR5, longest lead)**
Scripts in `tools/blender/`. Sources in git-ignored `assets-src/` with sha256 README.
1. `inspect.py` (A1 gate, time-box 2h): import uid 3026bd87…, report object count, names, hierarchy, bbox, materials. Pass: crank, 8 pistons, 8 rods, heads separate or separable. Budget time to reassemble the exploded layout.
2. `decimate.py`: collapse decimate per object. ~150k tris desktop, ~50k mobile. Bake normal + AO from the 2.2M original. Atlas 2k desktop, 1k mobile.
3. `rig_bake.py`: empties + slider-crank drivers, bake a 60-frame loop clip.
4. `export.sh`: `gltf-transform optimize --compress draco --texture-compress webp` → `web/public/models/engine-v1.glb` and `engine-v1-mobile.glb`. Versioned names, never overwrite. Draco decoder in `web/public/draco/`. CC BY credit in content file.

Fallback ladder at A1: separate by loose parts → separate by material → Tomaso shell + hand-modelled internals (most likely) → model C shell / paid rigged model → ship the procedural placeholder.

**Track B. Runtime + scroll with placeholder engine (PR2)**
- `lib/loop.ts`, `scrollState.ts`, `scrollMap.ts`, `phase.ts`
- `components/experience/{Experience,Scene,Driver,CameraRig}.tsx`
- `components/engine/PlaceholderEngine.tsx` (V8 from primitives honoring the contract), `EngineModel.tsx`. `?engine=placeholder|glb` switch.
- `components/gate/StartButton.tsx`, `Captions.tsx`
- Debug hook: `?debug` exposes `window.__lc = { setProgress(p), freezeTime(t), info }`.
- Reduced-motion: no pin, static poster hero, content sections.

**Track C. Shaders in an isolated sandbox (PR3)**
- `app/lab/page.tsx` dev-only with uniform sliders. Interface: `uRpm`, `uCombustion`, `uFog`, `uLaunch`, `uTime`.
- `shaders/{fog,rays,distort,combustion,morph}.glsl`, `components/fx/{ExhaustFog,LightRays,Distortion,LaunchPoints}.tsx`.

**Track D. Content sections (PR4)**
- `components/sections/{Service,Process,Work,Cta,Footer}.tsx`, `components/ui/*`. Semantic HTML, Framer reveals, reads only from `site.ts`.

**Phase E. Integration.** Swap real glb, retune scrollMap and camera path, rebuild point attributes, light and bloom tuning. Reference-first self-review side by side with `docs/inspo/` in Playwright.

**Phase F. Perf, mobile, hardening (PR6).** **Phase G. Deploy** (Vercel). Verify on the live URL.

Critical path: A1 gate → A pipeline → E. Everything else proceeds on the placeholder.

## Performance budget and mobile

- JS budget applies to the initial route: gate shell under 100kb gz. 3D chunk lazy, capped 350kb gz, granular drei imports.
- Hero payload: desktop glb ≤ 4MB, mobile ≤ 1.5MB. Total ≤ 6MB desktop, ≤ 3MB mobile.
- LCP < 2.5s (the button), CLS < 0.1, INP < 200ms, TBT < 200ms. 60fps desktop, 30fps mobile floor with dynamic resolution.
- GPU memory: a 2048² RGBA texture with mips is ~22MB. Cap desktop at ~4 textures of 2k, mobile 1k. Dispose gate-only resources after ignition.
- `detect-gpu` tiers high/mid/low: DPR 2/1.5/1.25, particles 120k/60k/35k, fog layers 6/4/2, bloom half-res on mobile, low tier drops distortion and uses mobile glb.
- Touch: native scroll (Lenis `syncTouch` off). `svh` units, `ScrollTrigger.config({ ignoreMobileResize: true })`.
- Pause on `visibilitychange`. Handle `webglcontextlost`. No WebGL or reduced motion: static poster + full content.
- Content-hash asset filenames, immutable cache headers. No `cache:'force-cache'` anywhere. Grep before shipping.

## Risks
1. Tomaso model is exploded and parts may be merged. A1 time-box + fallback ladder.
2. 2.2M-face import can stall Blender MCP. Decimate per object, save incrementally.
3. Sketchfab download needs Eris's API key.
4. JS budget vs stack weight (resolved above: initial route only).
5. GPU memory on phones. Tier profiles + RSS test.
6. Overdraw jank from fog + bloom. Profile with `?canvas=0` first.
7. iOS Safari scroll feel. Native scroll on touch, extra QA.
8. License: CC BY credit must be on the site. Model A (CC BY-NC) is never used.
9. Strict mode / HMR double-registering the ticker. Loop module owns idempotent setup/teardown.
10. Deterministic visuals: noise reads `uTime`, debug hook freezes it.
11. Headless WebGL needs SwiftShader flags in CI.

## Test strategy
- Visual regression: `?debug&engine=placeholder`, `window.__lc.setProgress(p)` + `freezeTime`. Shots at p = 0, 0.1, 0.3, 0.5, 0.7, 0.9, 0.97, 1 at 320/768/1024/1440. `toHaveScreenshot` maxDiffPixelRatio ~0.02. Placeholder and real-asset baselines separate. Every baseline eyeballed against the inspo board.
- Gate and scroll behaviour: lock before press, no camera jump at handoff, reload resets to top, hash and skip link bypass, reduced-motion and no-WebGL paths, keyboard path.
- Renderer RSS: persistent-context Playwright, renderer pid via CDP `SystemInfo.getProcessInfo`, sample `ps -o rss=` every 500ms across 3 full scroll loops. Peak under a ceiling set after first baseline (~600MB starting guess), loop-3 minus loop-1 drift under 10%. `renderer.info.memory` flat across loops. Repeat under mobile emulation with 4× CPU throttle.
- Frame time: p95 rAF delta on desktop and throttled mobile. `?canvas=0` to isolate non-3D jank.
- Lighthouse CI on the gate route.
- Vitest: slider-crank kinematics, firing order, scrollMap monotonic, site.ts schema, node contract test on placeholder and glb.
- Manual: real iOS Safari and Android Chrome, full flow on the live deploy.
- Review gates: code-reviewer after each PR, consensus-reviewer before any visual is shown, security-reviewer if the CTA form lands with an API.
