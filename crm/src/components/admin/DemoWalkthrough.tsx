"use client";

import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { goToStepAction } from "@/app/(admin)/admin/demo/actions";
import { DEMO_STEPS, LAST_STEP } from "@/lib/demo/script";

// The demo's two pieces: a thin strip at the top that says this is the demo, and the card Max
// reads from. Next puts the database in the next state and moves the CRM to the screen that
// shows it; Back goes the other way. The card can be closed to click around and reopened.

const CARD_KEY = "lc-demo-card-closed";
const SIZE_KEY = "lc-demo-card-size";
const OPEN_EVENT = "lc-demo-open";

// Whether the card is closed lives in localStorage (per viewer) and is read as an external store,
// so the server renders it open and the browser settles without a setState in an effect.
function subscribeClosed(onChange: () => void) {
  window.addEventListener(OPEN_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(OPEN_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}
// Where storage throws (some private windows), the choice is kept in memory for this page instead,
// so Close, Minimise and expand still work; it just isn't remembered.
let memoryClosed = false;
function readClosed(): boolean {
  try { return localStorage.getItem(CARD_KEY) === "1"; } catch { return memoryClosed; }
}
function setClosedFlag(closed: boolean) {
  memoryClosed = closed;
  try {
    if (closed) localStorage.setItem(CARD_KEY, "1");
    else localStorage.removeItem(CARD_KEY);
  } catch { /* private window: memoryClosed holds it */ }
  window.dispatchEvent(new Event(OPEN_EVENT));
}

// Full card or a one-line pill. Until the visitor picks, the size is "auto": both are rendered and
// CSS shows the full card only on a roomy screen (wide and taller than 640px) and the pill
// everywhere else, so neither the server render nor the first paint guesses wrong. Once the
// visitor expands or minimises, that choice is kept per viewer.
type CardSize = "auto" | "collapsed" | "expanded";
let memorySize: CardSize = "auto";
function readSize(): CardSize {
  try {
    const v = localStorage.getItem(SIZE_KEY);
    return v === "collapsed" || v === "expanded" ? v : "auto";
  } catch { return memorySize; }
}
function setSize(size: Exclude<CardSize, "auto">) {
  memorySize = size;
  try { localStorage.setItem(SIZE_KEY, size); } catch { /* private window: memorySize holds it */ }
  window.dispatchEvent(new Event(OPEN_EVENT));
}
// Roomy: the desktop width (64rem) and more than 640px tall. Mirrors the `auto` classes below.
const SHOW_WHEN_ROOMY = "hidden [@media(width>=64rem)_and_(height>40rem)]:block";
const HIDE_WHEN_ROOMY = "[@media(width>=64rem)_and_(height>40rem)]:hidden";

interface Props {
  companyName: string;
  step: number;
}

export function DemoStrip({ companyName, step }: Props) {
  const [pending, start] = useTransition();
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const reset = (company: string) =>
    start(async () => {
      const result = await goToStepAction(0, company || undefined);
      if (!result.ok) return setError(result.error);
      setError(null);
      setClosedFlag(false);
      router.push(result.route);
      router.refresh();
    });

  return (
    <div className="relative z-20 border-b border-[var(--color-border)] bg-[var(--color-bg-card)] px-4 py-1.5 text-[14px] sm:px-6 shell:px-8">
      {/* One row: the note wraps beside the buttons rather than pushing them onto a second line. */}
      <div className="flex items-center gap-x-4">
        <p className="flex min-w-0 flex-1 items-center gap-2 text-[var(--color-text-muted)]">
          <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-[var(--color-accent)]" />
          <span className="text-[var(--color-text)]">Demo</span>
          <span className="hidden text-[13px] leading-[1.35] sm:inline xl:text-[14px]">{companyName}. Nothing here is real and no email leaves it.</span>
        </p>
        <div className="flex shrink-0 items-center gap-1">
          {step > 0 && (
            <button type="button" className="btn btn-quiet btn-sm px-2 text-[11px]" onClick={() => setClosedFlag(false)}>
              Walkthrough
            </button>
          )}
          <button type="button" className="btn btn-quiet btn-sm px-2 text-[11px]" disabled={pending} onClick={() => setResetting((v) => !v)} aria-expanded={resetting}>
            Start over
          </button>
        </div>
      </div>
      {resetting && (
        <form
          className="mt-2.5 flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            reset(String(new FormData(e.currentTarget).get("company") ?? "").trim());
            setResetting(false);
          }}
        >
          <label className="text-[var(--color-text-muted)]" htmlFor="demo-company">Show it as</label>
          <input id="demo-company" name="company" className="field w-64 max-w-full" placeholder={companyName} maxLength={60} autoComplete="organization" />
          <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>Start over</button>
        </form>
      )}
      {error && <p role="alert" className="mt-2 text-[14px] text-[var(--color-hot)]">{error}</p>}
    </div>
  );
}

export function DemoCard({ step }: { step: number }) {
  const closed = useSyncExternalStore(subscribeClosed, readClosed, () => false);
  const size = useSyncExternalStore(subscribeClosed, readSize, (): CardSize => "auto");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  // After expanding or minimising, keyboard focus follows to the matching button in the other view.
  const focusAfterToggle = useRef<"pill" | "card" | null>(null);
  const pillToggle = useRef<HTMLButtonElement>(null);
  const cardToggle = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const target = focusAfterToggle.current;
    if (!target) return;
    focusAfterToggle.current = null;
    (target === "pill" ? pillToggle : cardToggle).current?.focus();
  }, [size]);

  const go = (target: number) =>
    start(async () => {
      const result = await goToStepAction(target);
      if (!result.ok) return setError(result.error);
      setError(null);
      router.push(result.route);
      router.refresh();
    });
  const close = () => setClosedFlag(true);
  const expand = () => { focusAfterToggle.current = "card"; setSize("expanded"); };
  const collapse = () => { focusAfterToggle.current = "pill"; setSize("collapsed"); };

  if (closed) return null;
  const current = DEMO_STEPS[Math.max(0, Math.min(LAST_STEP, step))];
  const atStart = step <= 0;
  const atEnd = step >= LAST_STEP;
  const where = atStart ? "Demo" : `Step ${step} of ${LAST_STEP}`;

  const showCard = size === "auto" ? SHOW_WHEN_ROOMY : size === "expanded" ? "block" : "hidden";
  const showPill = size === "auto" ? `flex ${HIDE_WHEN_ROOMY}` : size === "collapsed" ? "flex" : "hidden";

  // The forward action, the same in both views.
  const forward = (cls: string) =>
    atStart ? (
      <button type="button" className={cls} disabled={pending} onClick={() => go(1)}>{pending ? "One moment" : "Start the demo"}</button>
    ) : (
      <button type="button" className={cls} disabled={pending} onClick={() => go(atEnd ? 0 : step + 1)}>
        {pending ? "One moment" : atEnd ? "Start over" : "Next"}
      </button>
    );

  return (
    <>
      {/* The pill: one line, docked above the bottom tab bar (68px) on phones, out of the way of the page. */}
      <aside
        aria-label="Demo walkthrough"
        className={`card fixed right-4 bottom-20 left-4 z-40 items-center gap-2 py-2 pr-2 pl-1 shadow-[0_12px_32px_rgba(0,0,0,0.55)] sm:left-auto sm:max-w-[min(36rem,calc(100vw-2rem))] shell:right-6 shell:bottom-6 ${showPill}`}
      >
        <button
          ref={pillToggle}
          type="button"
          onClick={expand}
          aria-expanded={false}
          aria-label={`${where}: ${current.title}. Show the full step`}
          className="flex min-h-[44px] min-w-0 flex-1 items-center gap-2 rounded-[var(--radius-sm)] px-3 text-left"
        >
          <span className="shrink-0 font-mono text-[13px] text-[var(--color-text-dim)]">
            {atStart ? "Demo" : (
              <>
                <span className="sm:hidden">{`${step}/${LAST_STEP}`}</span>
                <span className="hidden sm:inline">{where}</span>
              </>
            )}
          </span>
          <span aria-hidden="true" className="text-[var(--color-text-dim)]">·</span>
          <span className="min-w-0 truncate text-[15px] font-semibold text-[var(--color-text)]">{current.title}</span>
          <svg aria-hidden="true" viewBox="0 0 16 16" className="ml-auto h-4 w-4 shrink-0 text-[var(--color-text-muted)]">
            <path d="M4 10l4-4 4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {error && <span role="alert" className="sr-only">{error}</span>}
        {forward("btn btn-primary btn-sm shrink-0")}
      </aside>

      <aside
        aria-label="Demo walkthrough"
        onKeyDown={(e) => { if (e.key === "Escape") collapse(); }}
        className={`card fixed right-4 bottom-20 left-4 z-40 max-h-[calc(100dvh-6rem)] overflow-y-auto p-5 shadow-[0_18px_48px_rgba(0,0,0,0.55)] sm:left-auto sm:w-[420px] shell:right-8 shell:bottom-8 shell:max-h-[calc(100dvh-4rem)] ${showCard}`}
      >
        <div className="flex items-start justify-between gap-3">
          <p className="font-mono text-[13px] text-[var(--color-text-dim)]">{where}</p>
          <div className="-mt-1 -mr-2 flex items-center gap-1">
            <button
              ref={cardToggle}
              type="button"
              onClick={collapse}
              aria-expanded={true}
              className="btn btn-quiet btn-sm px-2 text-[11px]"
              aria-label="Minimise the walkthrough"
            >
              Minimise
            </button>
            <button type="button" onClick={close} className="btn btn-quiet btn-sm px-2 text-[11px]" aria-label="Close the walkthrough">
              Close
            </button>
          </div>
        </div>
        <h2 className="mt-1 text-[20px] font-semibold text-[var(--color-text)]">{current.title}</h2>
        <p className="mt-2 text-[16px] leading-[1.5] text-[var(--color-text-muted)]">{current.say}</p>
        {error && <p role="alert" className="mt-2 text-[14px] text-[var(--color-hot)]">{error}</p>}
        <div className="mt-5 flex items-center gap-2">
          {!atStart && (
            <button type="button" className="btn btn-secondary btn-sm" disabled={pending} onClick={() => go(step - 1)}>Back</button>
          )}
          {forward(atStart ? "btn btn-primary" : "btn btn-primary btn-sm")}
        </div>
      </aside>
    </>
  );
}
