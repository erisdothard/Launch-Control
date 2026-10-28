"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { checkMail } from "@/app/(admin)/admin/inbox/actions";

// Pulls new mail from Outlook on a tap, and on its own once a minute while the Inbox is on screen.
const EVERY_MS = 60_000;

function clock(d: Date): string {
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).replace(" ", "").toLowerCase();
}

export default function CheckMail({ demo = false }: { demo?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);

  const check = useCallback(async () => {
    if (demo || running.current) return;
    running.current = true;
    setBusy(true);
    try {
      const result = await checkMail();
      if (result.ok) {
        setError(null);
        setCheckedAt(new Date());
        router.refresh();
      } else {
        setError(result.error);
      }
    } catch {
      setError("Couldn't reach Outlook. Try again in a minute.");
    } finally {
      running.current = false;
      setBusy(false);
    }
  }, [demo, router]);

  useEffect(() => {
    if (demo) return;
    const tick = () => {
      if (document.visibilityState === "visible") void check();
    };
    const timer = window.setInterval(tick, EVERY_MS);
    // Coming back to the tab checks straight away instead of waiting for the next minute.
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [check, demo]);

  return (
    <div className="flex items-center gap-3">
      <span aria-live="polite" className={`text-[14px] ${error ? "text-[var(--color-hot)]" : "text-[var(--color-text-dim)]"}`}>
        {error ?? (busy ? "Checking Outlook…" : checkedAt ? `Checked ${clock(checkedAt)}` : "")}
      </span>
      <button type="button" onClick={() => void check()} disabled={busy || demo} className="btn btn-secondary btn-sm">
        {busy ? "Checking" : "Check mail"}
      </button>
    </div>
  );
}
