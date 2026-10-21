"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// An email can't be pulled back once it leaves, so "Undo" holds the send for a few seconds
// instead: the toast shows, and the real send runs only when the hold runs out.
const HOLD_MS = 5000;

interface Pending {
  label: string;
  run: () => Promise<void>;
  onUndo?: () => void;
}

export interface UndoableSend {
  /** Queue a send. The UI should move on immediately (optimistic); `onUndo` restores it. */
  schedule: (label: string, run: () => Promise<void>, onUndo?: () => void) => void;
  toast: React.ReactNode;
}

export function useUndoableSend(): UndoableSend {
  const [pending, setPending] = useState<Pending | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const current = useRef<Pending | null>(null);

  const flush = useCallback(() => {
    const p = current.current;
    current.current = null;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setPending(null);
    if (p) void p.run();
  }, []);

  const schedule = useCallback(
    (label: string, run: () => Promise<void>, onUndo?: () => void) => {
      // A second send while one is held sends the first right away.
      if (current.current) flush();
      const p = { label, run, onUndo };
      current.current = p;
      setPending(p);
      timer.current = setTimeout(flush, HOLD_MS);
    },
    [flush]
  );

  const undo = useCallback(() => {
    const p = current.current;
    current.current = null;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setPending(null);
    p?.onUndo?.();
  }, []);

  // Leaving the page sends what's held rather than dropping it silently.
  useEffect(() => () => flush(), [flush]);

  const toast = (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-24 left-1/2 z-50 flex -translate-x-1/2 items-center gap-5 rounded-[var(--radius-md)] bg-[var(--color-bg-secondary)] py-3 pr-4 pl-5 text-[15px] text-[var(--color-text)] shadow-[inset_0_0_0_1px_var(--color-border-bright),0_12px_40px_rgba(0,0,0,0.5)] transition-[opacity,transform] duration-200 lg:bottom-7 ${
        pending ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0"
      }`}
    >
      <span>{pending?.label}</span>
      <button type="button" onClick={undo} className="px-1.5 py-1 font-semibold text-[var(--color-accent)]">
        Undo
      </button>
    </div>
  );

  return { schedule, toast };
}
