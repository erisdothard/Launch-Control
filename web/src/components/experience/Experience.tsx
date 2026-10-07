"use client";

/*
  Experience: the client orchestrator for the engine.
  - Decides full 3D vs poster (reduced motion, no WebGL, context lost → poster). `?skip`, a #hash
    and a reload after a launch keep the 3D and only skip the gate: the engine never leaves.
  - Owns the loop lifecycle, the stage trigger (500svh #hero → scrollState.pRaw), the content
    trigger (stage end → document end → scrollState.q), the gate lock/unlock, the time-based
    ignition timeline and the handoff to scroll at p = 0.
  - The canvas is a fixed full-viewport layer behind everything; content panels slide over it.
  - No gauge, no telemetry: the only HUD is the caption. The engine is atmosphere behind the type.
  - Debug hook: `?debug` exposes window.__lc = { setProgress(p), freezeTime(t), info() }.
  - The 3D chunk is dynamically imported with ssr:false from this client component.
*/

import dynamic from "next/dynamic";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { preload } from "react-dom";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { site } from "@/content/site";
import { scrollState } from "@/lib/scrollState";
import {
  freezeTime,
  getContentTrigger,
  getHeroTrigger,
  lockScroll,
  onFrame,
  pixelForProgress,
  scrollToImmediate,
  setContentTrigger,
  setHeroTrigger,
  snapProgress,
  startLoop,
  tickOnce,
  unlockScroll,
} from "@/lib/loop";
import {
  getPhase,
  hasLaunchedThisSession,
  openGate,
  setLoadProgress,
  setPhase,
  setPoster,
  setQueued,
  usePhase,
} from "@/lib/phase";
import { IGNITION_SECONDS } from "@/lib/scrollMap";
import { attachSpin } from "@/lib/spin";
import { engineAudio } from "@/lib/audio";
import { getGPUTier } from "detect-gpu";
import type { EngineSource } from "./Scene";
import type { FxQuality } from "@/components/fx/Effects";
import { Gate } from "@/components/gate/Gate";
import { Captions, CAPTIONS_ID } from "@/components/hud/Captions";

const Scene = dynamic(() => import("./Scene").then((m) => m.Scene), { ssr: false });

type Mode = "pending" | "full" | "poster";

declare global {
  interface Window {
    __lc?: {
      setProgress: (p: number) => void;
      freezeTime: (t: number | null) => void;
      info: () => Record<string, unknown>;
    };
  }
}

function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

/** Canvas opacity once the content has taken over. */
const CANVAS_DIM = 0.5;

/** Served from the HTML head so the two big files start before any script runs. */
const ENGINE_URL = "/models/engine-v2.glb";
const HDRI_URL = "/hdr/machine_shop_01_1k.hdr";

export function Experience() {
  preload(ENGINE_URL, { as: "fetch", crossOrigin: "anonymous" });
  preload(HDRI_URL, { as: "fetch", crossOrigin: "anonymous" });
  const [mode, setMode] = useState<Mode>("pending");
  const [engine, setEngine] = useState<EngineSource>("glb");
  const [fxQuality, setFxQuality] = useState<FxQuality | null>("mid");
  const [debug, setDebug] = useState(false);
  const skipGate = useRef(false);
  const heroRef = useRef<HTMLElement>(null);
  const canvasWrap = useRef<HTMLDivElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  const captionsEl = useRef<HTMLElement | null>(null);
  const ignitionTween = useRef<gsap.core.Tween | null>(null);
  const contextLosses = useRef(0);
  const { posterReason } = usePhase();

  /* Mode decision, once, on the client, after the first paint (the gate HTML is already up).
     The FX tier is resolved BEFORE the scene mounts: changing it later rebuilds the composer. */
  useEffect(() => {
    let cancelled = false;
    const id = requestAnimationFrame(() => {
      const params = new URLSearchParams(window.location.search);
      setDebug(params.has("debug"));
      setEngine(params.get("engine") === "placeholder" ? "placeholder" : "glb");
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const hash = window.location.hash.length > 1;
      const poster = reduced ? "reduced-motion" : !hasWebGL() ? "no-webgl" : null;
      if (poster) {
        setPoster(poster);
        openGate();
        setMode("poster");
        return;
      }
      skipGate.current = hasLaunchedThisSession() || params.has("skip") || hash;
      /* FX tier: `?fx=high|mid|low|off` overrides; otherwise detect-gpu decides (PLAN.md tiers). */
      const fxParam = params.get("fx");
      const resolved: Promise<FxQuality | null> =
        fxParam === "off"
          ? Promise.resolve(null)
          : fxParam === "high" || fxParam === "mid" || fxParam === "low"
            ? Promise.resolve(fxParam)
            : getGPUTier()
                .then((t) => {
                  const q: FxQuality = t.tier >= 3 ? "high" : t.tier === 2 ? "mid" : "low";
                  return t.isMobile && q === "high" ? "mid" : q;
                })
                .catch(() => "mid" as const);
      void resolved.then((q) => {
        if (cancelled) return;
        setFxQuality(q);
        setMode("full");
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
    };
  }, []);

  const toPoster = useCallback((reason: "context-lost") => {
    ignitionTween.current?.kill();
    setPoster(reason);
    openGate();
    unlockScroll();
    setMode("poster");
  }, []);

  /* Full mode: loop, triggers, lock. Layout effect so the triggers exist before the first paint. */
  useLayoutEffect(() => {
    if (mode !== "full") return;
    const hero = heroRef.current;
    if (!hero) return;
    history.scrollRestoration = "manual";
    window.scrollTo(0, 0);
    const stopLoop = startLoop();
    lockScroll();

    const st = ScrollTrigger.create({
      trigger: hero,
      start: "top top",
      end: "bottom bottom",
      // Refresh before every content trigger so their start positions are final.
      refreshPriority: 10,
      onUpdate: (self) => {
        scrollState.pRaw = self.progress;
      },
    });
    setHeroTrigger(st);
    const ct = ScrollTrigger.create({
      start: () => st.end,
      end: () => ScrollTrigger.maxScroll(window),
      invalidateOnRefresh: true,
      onUpdate: (self) => {
        scrollState.q = self.progress;
      },
    });
    setContentTrigger(ct);
    ScrollTrigger.refresh();
    const detachSpin = attachSpin(hero);

    const offFrame = onFrame(() => {
      const s = scrollState;
      engineAudio.setRpm(s.rpm);
      /* ---- LAUNCH: one ember flash, then the canvas dims behind the content. The engine stays. ---- */
      const wrap = canvasWrap.current;
      if (wrap) wrap.style.opacity = String(1 - (1 - CANVAS_DIM) * s.launch);
      const flash = flashRef.current;
      if (flash) {
        const f = s.launch > 0.2 && s.launch < 0.8 ? Math.sin(Math.PI * ((s.launch - 0.2) / 0.6)) * 0.18 : 0;
        flash.style.opacity = String(f);
      }
      /* Captions leave with the launch: fade over launch 0.15..0.45. */
      const hudFade = s.launch <= 0.15 ? 1 : s.launch >= 0.45 ? 0 : 1 - (s.launch - 0.15) / 0.3;
      if (!captionsEl.current) captionsEl.current = document.getElementById(CAPTIONS_ID);
      if (captionsEl.current) captionsEl.current.style.opacity = String(hudFade);
      /* ---- /LAUNCH ---- */
    });

    // Honest-ish load counter: chunk requested → 70, first frame → 100 (set by onFirstFrame).
    const counter = { v: 0 };
    const tween = gsap.to(counter, {
      v: 70,
      duration: 1.2,
      ease: "none",
      onUpdate: () => setLoadProgress(counter.v),
    });

    return () => {
      detachSpin();
      tween.kill();
      ignitionTween.current?.kill();
      offFrame();
      ct.kill();
      st.kill();
      setContentTrigger(null);
      setHeroTrigger(null);
      unlockScroll();
      stopLoop();
    };
  }, [mode]);

  const handoff = useCallback(() => {
    scrollToImmediate(0);
    unlockScroll();
    snapProgress(0);
    setPhase("idle");
    document.getElementById(CAPTIONS_ID)?.focus({ preventScroll: true });
  }, []);

  /* Gate bypass: the engine is already assembled and idling; just open up and honour the hash. */
  const bypass = useCallback(() => {
    scrollState.ignition = 1;
    unlockScroll();
    snapProgress(0);
    setPhase("idle");
    const hash = window.location.hash;
    if (hash.length > 1) {
      ScrollTrigger.refresh();
      document.querySelector(hash)?.scrollIntoView();
    }
  }, []);

  const ignite = useCallback(() => {
    const { phase: ph } = getPhase();
    if (ph === "loading") {
      setQueued(true);
      return;
    }
    if (ph !== "ready") return;
    setQueued(false);
    setPhase("igniting");
    void engineAudio.unlock();
    scrollState.ignition = 0;
    ignitionTween.current = gsap.to(scrollState, {
      ignition: 1,
      duration: IGNITION_SECONDS,
      ease: "none",
      onComplete: handoff,
    });
  }, [handoff]);

  const onFirstFrame = useCallback(() => {
    const counter = { v: getPhase().loadProgress };
    gsap.to(counter, {
      v: 100,
      duration: 0.3,
      ease: "none",
      onUpdate: () => setLoadProgress(counter.v),
      onComplete: () => {
        setLoadProgress(100);
        setPhase("ready");
        if (skipGate.current) bypass();
        else if (getPhase().queued) ignite();
      },
    });
  }, [ignite, bypass]);

  /* Debug hook. */
  useEffect(() => {
    if (!debug || mode !== "full") return;
    const forceOpen = () => {
      const ph = getPhase().phase;
      if (ph === "idle" || ph === "scrolling" || ph === "launched") return;
      ignitionTween.current?.kill();
      scrollState.ignition = 1;
      setLoadProgress(100);
      setPhase("idle");
      unlockScroll();
    };
    window.__lc = {
      setProgress: (p) => {
        forceOpen();
        ScrollTrigger.refresh();
        const y = pixelForProgress(p);
        scrollToImmediate(y);
        window.scrollTo(0, y);
        ScrollTrigger.update();
        snapProgress(p);
        tickOnce();
      },
      freezeTime: (t) => {
        freezeTime(t);
        tickOnce();
      },
      info: () => ({
        ...scrollState,
        fx: fxQuality,
        engine,
        store: getPhase(),
        heroStart: getHeroTrigger()?.start,
        heroEnd: getHeroTrigger()?.end,
        contentEnd: getContentTrigger()?.end,
      }),
    };
    return () => {
      delete window.__lc;
    };
  }, [debug, mode, fxQuality, engine]);

  const onContextLost = useCallback(() => {
    contextLosses.current += 1;
    if (contextLosses.current > 1) {
      toPoster("context-lost");
      return;
    }
    window.setTimeout(() => {
      if (contextLosses.current > 0 && getPhase().posterReason === null) {
        // not restored in time
        toPoster("context-lost");
      }
    }, 3000);
  }, [toPoster]);

  const onContextRestored = useCallback(() => {
    contextLosses.current = 0;
  }, []);

  const onSkip = useCallback(() => {
    skipGate.current = true;
    const ph = getPhase().phase;
    if (ph === "ready") bypass();
    else if (ph === "loading") setQueued(true);
  }, [bypass]);

  const poster = mode === "poster";

  /* #hero is ONE element in both modes: the 500svh stage in full mode (no background of its own,
     so the fixed canvas behind it shows), the poster frame otherwise. */
  return (
    <>
      <section
        id="hero"
        ref={heroRef}
        className={
          poster
            ? "relative min-h-[100svh] bg-background flex flex-col justify-end px-6 md:px-12 pb-section-sm pt-section-lg"
            : "relative h-[500svh]"
        }
        style={{ zIndex: "var(--z-canvas)" }}
      >
        {poster ? (
          <PosterHero notice={posterReason === "no-webgl" || posterReason === "context-lost"} />
        ) : (
          <>
            <div ref={canvasWrap} className="fixed inset-0 pointer-events-none" aria-hidden="true">
              {mode === "full" && (
                <Scene
                  engine={engine}
                  fxQuality={fxQuality}
                  onFirstFrame={onFirstFrame}
                  onContextLost={onContextLost}
                  onContextRestored={onContextRestored}
                />
              )}
            </div>
            {/* Launch flash: one ember bloom across the viewport, scrub-bound, never white. */}
            <div
              ref={flashRef}
              className="fixed inset-0 pointer-events-none opacity-0"
              style={{
                zIndex: 45,
                background:
                  "radial-gradient(ellipse 60% 50% at 50% 50%, var(--color-ember) 0%, rgba(250, 137, 39, 0.35) 45%, rgba(5, 8, 11, 0) 100%)",
              }}
              aria-hidden="true"
            />
            <Captions />
          </>
        )}
      </section>
      {!poster && <Gate onPress={ignite} onSkip={onSkip} />}
    </>
  );
}

/** Static poster hero content: the beat captions stacked on a dark frame. No canvas. */
function PosterHero({ notice }: { notice: boolean }) {
  return (
    <>
      <div className="max-w-content-max w-full mx-auto">
        <div className="h-[2px] w-24 bg-ember mb-12" aria-hidden="true" />
        <h1 className="sr-only">{site.seo.title}</h1>
        <ul className="flex flex-col gap-3 m-0 p-0 list-none">
          {site.beats.map((b) => (
            <li key={b.id} className="font-display uppercase text-caption-3d leading-[1.2] text-steel">
              {b.caption}
            </li>
          ))}
        </ul>
        {notice && (
          <p className="label-mono text-info mt-12" role="status">
            {site.gate.webglOffNotice}
          </p>
        )}
      </div>
    </>
  );
}
