"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./board.module.css";

// A button with a menu under (or over) it: Show, From, More and the row's "…". The menu is portalled
// to <body> and placed against the button, so the list's clipping and the shell's stacking can't hide
// it. Arrow keys move, Esc closes and hands focus back, Tab or a click outside closes.

type Placement = "down-left" | "down-right" | "up-left" | "up-right";

interface DropdownProps {
  /** The trigger's contents. */
  label: React.ReactNode;
  /** Accessible name for the trigger when its label is an icon. */
  ariaLabel?: string;
  menuLabel: string;
  className: string;
  placement?: Placement;
  /** Menu items; `close` shuts the menu and returns focus to the trigger. */
  children: (close: () => void) => React.ReactNode;
}

const GAP = 6;

export function Chevron() {
  return (
    <svg className={styles.chev} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3.5 5.5L7 9l3.5-3.5" />
    </svg>
  );
}

export function Tick() {
  return (
    <svg className={styles.tick} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 8.5l3 3 7-7" />
    </svg>
  );
}

export default function Dropdown({ label, ariaLabel, menuLabel, className, placement = "down-left", children }: DropdownProps) {
  // "refocus": closed from inside (a choice, Esc), so focus goes back to the trigger.
  const [state, setState] = useState<"closed" | "open" | "refocus">("closed");
  const open = state === "open";
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const close = useCallback((refocus = true) => setState(refocus ? "refocus" : "closed"), []);

  useEffect(() => {
    if (state === "refocus") btnRef.current?.focus();
  }, [state]);

  // Place against the button, then focus the checked item (or the first).
  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const b = btnRef.current.getBoundingClientRect();
    const [v, h] = placement.split("-");
    const m = menuRef.current;
    if (m) {
      // Written straight to the node before paint, so the menu is visible (and focusable) at once.
      m.style.top = v === "down" ? `${b.bottom + GAP}px` : "";
      m.style.bottom = v === "up" ? `${window.innerHeight - b.top + GAP}px` : "";
      m.style.left = h === "left" ? `${Math.max(8, b.left)}px` : "";
      m.style.right = h === "right" ? `${Math.max(8, window.innerWidth - b.right)}px` : "";
      m.style.maxWidth = "calc(100vw - 16px)";
    }
    const items = menuRef.current?.querySelectorAll<HTMLElement>("[role^=menuitem]:not(:disabled)");
    const checked = menuRef.current?.querySelector<HTMLElement>('[aria-checked="true"]');
    (checked ?? items?.[0])?.focus();
  }, [open, placement]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!menuRef.current?.contains(t) && !btnRef.current?.contains(t)) close(false);
    };
    // Close once the page really moves the trigger away; a stray scroll event that leaves it put is fine.
    const at = btnRef.current?.getBoundingClientRect();
    const onMove = (e: Event) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      const now = btnRef.current?.getBoundingClientRect();
      if (e.type === "resize" || !at || !now || Math.abs(now.top - at.top) > 2 || Math.abs(now.left - at.left) > 2) close(false);
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [open, close]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      // The panel listens for Esc too; the open menu takes it first.
      e.stopPropagation();
      e.nativeEvent.stopImmediatePropagation();
      close();
      return;
    }
    if (e.key === "Tab") return close(false);
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const items = [...(menuRef.current?.querySelectorAll<HTMLElement>("[role^=menuitem]:not(:disabled)") ?? [])];
    if (items.length === 0) return;
    let i = items.indexOf(document.activeElement as HTMLElement);
    i = e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : (i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    items[i].focus();
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={className}
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={(e) => {
          e.stopPropagation();
          setState((s) => (s === "open" ? "refocus" : "open"));
        }}
      >
        {label}
      </button>
      {open &&
        createPortal(
          <div ref={menuRef} id={menuId} role="menu" aria-label={menuLabel} className={styles.menu} onKeyDown={onKeyDown}>
            {children(close)}
          </div>,
          document.body
        )}
    </>
  );
}
