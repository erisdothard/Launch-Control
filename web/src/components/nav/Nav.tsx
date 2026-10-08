"use client";

/*
  Nav: minimal top bar. Transparent over the top of the hero, solid `surface` as soon as the page
  scrolls, never backdrop-filter. Wordmark and ≤4 items from site.nav; the last item (Book a launch)
  is the one yellow item. A passive scroll listener toggles a data attribute, so React never
  re-renders for it and it works with or without the 3D loop.
*/

import { useEffect, useRef } from "react";
import { site } from "@/content/site";

/** Scroll distance after which the bar turns solid. */
const SOLID_AFTER_PX = 24;

export function Nav() {
  const items = site.nav;
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const update = () => {
      el.dataset.solid = String(window.scrollY > SOLID_AFTER_PX);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  return (
    <header
      ref={headerRef}
      className="fixed top-0 left-0 right-0 bg-transparent data-[solid=true]:bg-surface data-[solid=true]:border-b data-[solid=true]:border-border"
      style={{ zIndex: "var(--z-hud)", transition: "background-color var(--duration-base) var(--ease-ui)" }}
    >
      <nav className="mx-auto max-w-content-max flex items-center justify-between h-14 px-6 md:px-12">
        <a href="#hero" className="font-display uppercase tracking-signage text-[13px] text-steel no-underline">
          {site.brand.wordmark}
        </a>
        <ul className="flex items-center gap-6 md:gap-8 m-0 p-0 list-none">
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
