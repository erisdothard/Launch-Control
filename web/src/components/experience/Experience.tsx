"use client";

/*
  Experience: the hero section and the engine behind the whole page.
  - The hero is real HTML (children), readable on first paint. No gate, no click-to-enter, no sound,
    no scroll lock. The page scrolls like any professional site from the first frame.
  - The engine is background: a fixed full-viewport canvas behind everything, dimmed, fading in when
    its first frame is drawn. Its scroll timeline (scrollMap: slow pull-apart, gentle revs) runs over
    the WHOLE page, so it keeps moving quietly behind every section.
  - Poster mode (reduced motion, no WebGL, context lost): the same hero, no canvas.
  - Debug hook: `?debug` exposes window.__lc = { setProgress(p), freezeTime(t), info() }.
  - The 3D chunk is dynamically imported with ssr:false from this client component.
*/

import dynamic from "next/dynamic";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { preload } from "react-dom";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { site } from "@/content/site";
import { scrollState } from "@/lib/scrollState";
import {
  freezeTime,
  getContentTrigger,
  getHeroTrigger,
  pixelForProgress,
  scrollToImmediate,
  setContentTrigger,
  setHeroTrigger,
  snapProgress,
  startLoop,
  tickOnce,
} from "@/lib/loop";
import { getPhase, openGate, setLoadProgress, setPhase, setPoster, usePhase } from "@/lib/phase";
import { attachSpin } from "@/lib/spin";
import type { EngineSource } from "./Scene";
import type { FxQuality } from "@/components/fx/Effects";

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

/** Canvas opacity: the engine is background, never the subject. */
const CANVAS_OPACITY = 0.8;

/* The two big files are preloaded after the first paint, never from the HTML head, so the page's own
   scripts get the bandwidth first on a phone connection. */
const ENGINE_URL = "/models/engine-v2.glb";
const HDRI_URL = "/hdr/machine_shop_01_512.hdr";

export function Experience({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode>("pending");
  const [engine, setEngine] = useState<EngineSource>("glb");
  /* Post-processing is off by default: no bloom, rays or flash behind a professional page.
     `?fx=high|mid|low` turns it back on for comparison. */
  const [fxQuality, setFxQuality] = useState<FxQuality | null>(null);
  const [debug, setDebug] = useState(false);
  const heroRef = useRef<HTMLElement>(null);
  const canvasWrap = useRef<HTMLDivElement>(null);
  const contextLosses = useRef(0);
  const { posterReason } = usePhase();

  /* Mode decision, once, on the client, after the first paint (the hero HTML is already up). */
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const params = new URLSearchParams(window.location.search);
      setDebug(params.has("debug"));
      const placeholder = params.get("engine") === "placeholder";
      setEngine(placeholder ? "placeholder" : "glb");
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const poster = reduced ? "reduced-motion" : !hasWebGL() ? "no-webgl" : null;
      openGate();
      if (poster) {
        setPoster(poster);
        setMode("poster");
        return;
      }
      preload(HDRI_URL, { as: "fetch", crossOrigin: "anonymous" });
      if (!placeholder) preload(ENGINE_URL, { as: "fetch", crossOrigin: "anonymous" });
      const fx = params.get("fx");
      setFxQuality(fx === "high" || fx === "mid" || fx === "low" ? fx : null);
      setMode("full");
    });
    return () => cancelAnimationFrame(id);
  }, []);

  const toPoster = useCallback((reason: "context-lost") => {
    setPoster(reason);
    setMode("poster");
  }, []);

  /* Full mode: the loop and the two scroll triggers. The engine's timeline spans the whole page. */
  useLayoutEffect(() => {
    if (mode !== "full") return;
    const hero = heroRef.current;
    if (!hero) return;
    const stopLoop = startLoop();

    const st = ScrollTrigger.create({
      trigger: document.documentElement,
      start: "top top",
      end: "bottom bottom",
      refreshPriority: 10,
      onUpdate: (self) => {
        scrollState.pRaw = self.progress;
      },
    });
    setHeroTrigger(st);
    /* q: 0 while the hero fills the screen, 1 at the bottom of the page (the environment dims with it). */
    const ct = ScrollTrigger.create({
      trigger: hero,
      start: "bottom bottom",
      endTrigger: document.documentElement,
      end: "bottom bottom",
      onUpdate: (self) => {
        scrollState.q = self.progress;
      },
    });
    setContentTrigger(ct);
    ScrollTrigger.refresh();
    // Start the engine's timeline where the visitor already is (a reload mid-page, a #hash link).
    snapProgress(st.progress);
    const detachSpin = attachSpin(hero);

    return () => {
      detachSpin();
      ct.kill();
      st.kill();
      setContentTrigger(null);
      setHeroTrigger(null);
      stopLoop();
    };
  }, [mode]);

  /* First frame drawn: the engine is already running. Fade the canvas in behind the page. */
  const onFirstFrame = useCallback(() => {
    scrollState.ignition = 1;
    setLoadProgress(100);
    setPhase("ready");
    setPhase("idle");
    const wrap = canvasWrap.current;
    if (wrap) wrap.style.opacity = String(CANVAS_OPACITY);
  }, []);

  /* Debug hook. */
  useEffect(() => {
    if (!debug || mode !== "full") return;
    window.__lc = {
      setProgress: (p) => {
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
      if (contextLosses.current > 0 && getPhase().posterReason === null) toPoster("context-lost");
    }, 3000);
  }, [toPoster]);

  const onContextRestored = useCallback(() => {
    contextLosses.current = 0;
  }, []);

  const notice = posterReason === "no-webgl" || posterReason === "context-lost";

  return (
    <section
      id="hero"
      ref={heroRef}
      aria-labelledby="hero-title"
      className="relative min-h-[100svh]"
      style={{ zIndex: "var(--z-canvas)" }}
    >
      {mode === "full" && (
        <div
          ref={canvasWrap}
          className="fixed inset-0 pointer-events-none"
          style={{ opacity: 0, transition: "opacity 1.2s var(--ease-ui)" }}
          aria-hidden="true"
        >
          <Scene
            engine={engine}
            fxQuality={fxQuality}
            onFirstFrame={onFirstFrame}
            onContextLost={onContextLost}
            onContextRestored={onContextRestored}
          />
        </div>
      )}
      {children}
      {notice && (
        <p className="label-mono text-info absolute bottom-6 left-6 lg:left-12" role="status">
          {site.hero.webglOffNotice}
        </p>
      )}
    </section>
  );
}
