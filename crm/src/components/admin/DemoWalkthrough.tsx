"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { goToStepAction } from "@/app/(admin)/admin/demo/actions";
import { DEMO_STEPS, LAST_STEP } from "@/lib/demo/script";

// The demo's two pieces: a thin strip at the top that says this is the demo, and the card Max
// reads from. Next puts the database in the next state and moves the CRM to the screen that
// shows it; Back goes the other way. The card can be closed to click around and reopened.

const CARD_KEY = "lc-demo-card-closed";
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
function readClosed(): boolean {
  try { return localStorage.getItem(CARD_KEY) === "1"; } catch { return false; }
}
function setClosedFlag(closed: boolean) {
  try { closed ? localStorage.setItem(CARD_KEY, "1") : localStorage.removeItem(CARD_KEY); } catch { /* private window */ }
  window.dispatchEvent(new Event(OPEN_EVENT));
}

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
    <div className="relative z-20 border-b border-[var(--color-border)] bg-[var(--color-bg-card)] px-4 py-2 text-[14px] sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="flex items-center gap-2 text-[var(--color-text-muted)]">
          <span aria-hidden="true" className="h-2 w-2 rounded-full bg-[var(--color-accent)]" />
          <span className="text-[var(--color-text)]">Demo</span>
          <span className="hidden sm:inline">{companyName}. Nothing here is real and no email leaves it.</span>
        </p>
        <div className="ml-auto flex items-center gap-2">
          {step > 0 && (
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => setClosedFlag(false)}>
              Walkthrough
            </button>
          )}
          <button type="button" className="btn btn-quiet btn-sm" disabled={pending} onClick={() => setResetting((v) => !v)} aria-expanded={resetting}>
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
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const go = (target: number) =>
    start(async () => {
      const result = await goToStepAction(target);
      if (!result.ok) return setError(result.error);
      setError(null);
      router.push(result.route);
      router.refresh();
    });
  const close = () => setClosedFlag(true);

  if (closed) return null;
  const current = DEMO_STEPS[Math.max(0, Math.min(LAST_STEP, step))];
  const atStart = step <= 0;
  const atEnd = step >= LAST_STEP;

  return (
    <aside
      aria-label="Demo walkthrough"
      className="card fixed right-4 bottom-20 left-4 z-40 p-5 shadow-[0_18px_48px_rgba(0,0,0,0.55)] sm:left-auto sm:w-[420px] lg:right-8 lg:bottom-8"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="font-mono text-[13px] text-[var(--color-text-dim)]">{atStart ? "Demo" : `Step ${step} of ${LAST_STEP}`}</p>
        <button type="button" onClick={close} className="btn btn-quiet btn-sm -mt-1 -mr-2" aria-label="Close the walkthrough">
          Close
        </button>
      </div>
      <h2 className="mt-1 text-[20px] font-semibold text-[var(--color-text)]">{current.title}</h2>
      <p className="mt-2 text-[16px] leading-[1.5] text-[var(--color-text-muted)]">{current.say}</p>
      {error && <p role="alert" className="mt-2 text-[14px] text-[var(--color-hot)]">{error}</p>}
      <div className="mt-5 flex items-center gap-2">
        {atStart ? (
          <button type="button" className="btn btn-primary" disabled={pending} onClick={() => go(1)}>
            {pending ? "One moment" : "Start the demo"}
          </button>
        ) : (
          <>
            <button type="button" className="btn btn-secondary btn-sm" disabled={pending} onClick={() => go(step - 1)}>Back</button>
            {atEnd ? (
              <button type="button" className="btn btn-primary btn-sm" disabled={pending} onClick={() => go(0)}>{pending ? "One moment" : "Start over"}</button>
            ) : (
              <button type="button" className="btn btn-primary btn-sm" disabled={pending} onClick={() => go(step + 1)}>{pending ? "One moment" : "Next"}</button>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
