"use client";

/*
  Nav: minimal top bar. Transparent over the top of the hero, solid `surface` as soon as the page
  scrolls, never backdrop-filter. Wordmark and ≤4 items from site.nav; the last item (Book a launch)
  is the one yellow item, drawn as a small outlined button so it reads as the call to action.
  Below sm the bar is wordmark + Menu only (the outlined CTA and the wordmark do not both fit on
  a 375px phone); the Menu opens a solid panel under the bar listing every item, Book a launch
  last in yellow, so every section stays reachable on a phone. A passive scroll listener toggles a data attribute,
  so React never re-renders for it and it works with or without the 3D loop.
*/

import { useEffect, useRef, useState } from "react";
import { site } from "@/content/site";

/** Scroll distance after which the bar turns solid. */
const SOLID_AFTER_PX = 24;

const CTA =
  "label-mono hidden min-h-9 items-center whitespace-nowrap border border-ember px-3 text-ember no-underline transition-colors duration-fast ease-ui hover:bg-ember hover:text-background sm:inline-flex";

export function Nav() {
  const items = site.nav;
  const links = items.slice(0, -1);
  const cta = items[items.length - 1];
  const headerRef = useRef<HTMLElement>(null);
  const [open, setOpen] = useState(false);

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
      data-open={open}
      className="fixed top-0 left-0 right-0 bg-transparent data-[solid=true]:bg-surface data-[solid=true]:border-b data-[solid=true]:border-border data-[open=true]:bg-surface data-[open=true]:border-b data-[open=true]:border-border"
      style={{ zIndex: "var(--z-hud)", transition: "background-color var(--duration-base) var(--ease-ui)" }}
    >
      <nav className="mx-auto max-w-content-max flex items-center justify-between gap-4 h-14 px-6 md:px-12">
        <a href="#hero" className="shrink-0 font-display uppercase tracking-signage text-[11px] sm:text-[13px] text-steel no-underline">
          {site.brand.wordmark}
        </a>
        <div className="flex items-center gap-4 sm:gap-6 md:gap-8">
          <ul className="hidden items-center gap-6 m-0 p-0 list-none sm:flex md:gap-8">
            {links.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  className="label-mono text-muted no-underline hover:text-text"
                  style={{ transition: "color var(--duration-fast) var(--ease-ui)" }}
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
          <a href={cta.href} className={CTA} onClick={() => setOpen(false)}>
            {cta.label}
          </a>
          <button
            type="button"
            aria-expanded={open}
            aria-controls="nav-menu"
            onClick={() => setOpen((value) => !value)}
            className="label-mono min-h-9 cursor-pointer border-0 bg-transparent px-0 text-muted hover:text-text sm:hidden"
          >
            {open ? site.navMenu.close : site.navMenu.open}
          </button>
        </div>
      </nav>
      <ul
        id="nav-menu"
        hidden={!open}
        className="m-0 flex list-none flex-col border-t border-border p-0 sm:hidden"
      >
        {items.map((item) => (
          <li key={item.href} className="border-b border-border last:border-b-0">
            <a
              href={item.href}
              onClick={() => setOpen(false)}
              className={`label-mono block px-6 py-4 no-underline ${item.href === cta.href ? "text-ember" : "text-text"}`}
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </header>
  );
}
