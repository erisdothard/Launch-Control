"use client";

/*
  Nav: minimal top bar. Transparent over the engine stage, solid `surface` once the content takes
  over, never backdrop-filter. Wordmark, the sound toggle
  once the engine runs, and ≤4 items from site.nav; the last item (Book a launch) is the one ember accent.
  Inert while the gate is closed so the skip link and START are first in the tab order.
*/

import { site } from "@/content/site";
import { usePhase } from "@/lib/phase";
import { AudioToggle } from "@/components/hud/AudioToggle";

export function Nav() {
  const items = site.nav;
  const { gateOpen, phase, posterReason } = usePhase();
  const running = posterReason === null && (phase === "idle" || phase === "scrolling" || phase === "launched");
  return (
    <header
      className={`fixed top-0 left-0 right-0 ${phase === "launched" || posterReason !== null ? "bg-surface" : "bg-transparent"}`}
      style={{ zIndex: "var(--z-hud)", transition: "background-color var(--duration-emphasis) var(--ease-ui)" }}
      inert={!gateOpen}
    >
      <nav className="mx-auto max-w-content-max flex items-center justify-between h-14 px-6 md:px-12">
        <a href="#hero" className="font-display uppercase tracking-signage text-[13px] text-steel no-underline">
          {site.brand.wordmark}
        </a>
        <ul className="flex items-center gap-6 md:gap-8 m-0 p-0 list-none">
          {running && (
            <li className="hidden sm:block">
              <AudioToggle />
            </li>
          )}
          {items.map((item, i) => {
            const accent = i === items.length - 1;
            return (
              <li key={item.href} className={accent ? "" : "hidden sm:block"}>
                <a
                  href={item.href}
                  className={`label-mono no-underline ${accent ? "text-ember" : "text-muted hover:text-text"}`}
                  style={{ transition: "color var(--duration-fast) var(--ease-ui)" }}
                >
                  {item.label}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
    </header>
  );
}
