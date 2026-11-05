"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { saveDraftEditsAction } from "@/app/(admin)/admin/drafts/actions";

export type DraftSaveState = "idle" | "saving" | "saved" | "error" | "gone";

// Saves once typing pauses, not on every key. A failed save tries again a few times on its own.
const WAIT_MS = 800;
const RETRY_MS = 3000;
const RETRIES = 3;

interface Edit {
  subject?: string;
  body: string;
  /** Bumped on every keystroke, so an older save finishing never marks newer text as saved. */
  version: number;
  tries: number;
  timer: ReturnType<typeof setTimeout> | null;
}

/**
 * Saves edits to drafted emails a moment after typing stops, so they survive moving to the next
 * draft, a reload or a refresh. Each draft has its own timer and its own saved / failed status.
 */
export function useDraftAutosave(enabled: boolean): {
  stateOf: (draftId: string | undefined) => DraftSaveState;
  queue: (draftId: string, edit: { subject?: string; body: string }) => void;
} {
  const edits = useRef(new Map<string, Edit>());
  const [states, setStates] = useState<Record<string, DraftSaveState>>({});
  const mark = useCallback((draftId: string, state: DraftSaveState) => setStates((prev) => ({ ...prev, [draftId]: state })), []);
  // A retry calls the latest flush through this, since flush can't name itself.
  const retry = useRef<(draftId: string) => void>(() => undefined);

  const flush = useCallback(
    async (draftId: string) => {
      const edit = edits.current.get(draftId);
      if (!edit) return;
      if (edit.timer) clearTimeout(edit.timer);
      edit.timer = null;
      const { version } = edit;
      let result: Awaited<ReturnType<typeof saveDraftEditsAction>>;
      try {
        result = await saveDraftEditsAction(draftId, { subject: edit.subject, body: edit.body });
      } catch {
        result = { ok: false, error: "offline" };
      }
      const latest = edits.current.get(draftId);
      // Typed again while this was saving: the newer save reports instead.
      if (!latest || latest.version !== version) return;
      if (result.ok) {
        edits.current.delete(draftId);
        return mark(draftId, "saved");
      }
      if (!result.ok && result.gone) {
        edits.current.delete(draftId);
        return mark(draftId, "gone");
      }
      mark(draftId, "error");
      if (latest.tries < RETRIES) {
        latest.tries += 1;
        latest.timer = setTimeout(() => retry.current(draftId), RETRY_MS * latest.tries);
      }
    },
    [mark]
  );

  useEffect(() => {
    retry.current = (draftId) => void flush(draftId);
  }, [flush]);

  const queue = useCallback(
    (draftId: string, edit: { subject?: string; body: string }) => {
      if (!enabled) return;
      const prev = edits.current.get(draftId);
      if (prev?.timer) clearTimeout(prev.timer);
      edits.current.set(draftId, {
        ...edit,
        version: (prev?.version ?? 0) + 1,
        tries: 0,
        timer: setTimeout(() => void flush(draftId), WAIT_MS),
      });
      mark(draftId, "saving");
    },
    [enabled, flush, mark]
  );

  // Leaving before the pause (another screen, a refresh, closing or backgrounding the tab): save now.
  useEffect(() => {
    const waiting = edits.current;
    const flushAll = () => {
      for (const draftId of [...waiting.keys()]) void flush(draftId);
    };
    const onHide = () => document.visibilityState === "hidden" && flushAll();
    window.addEventListener("pagehide", flushAll);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", flushAll);
      document.removeEventListener("visibilitychange", onHide);
      flushAll();
    };
  }, [flush]);

  const stateOf = useCallback((draftId: string | undefined) => (draftId ? (states[draftId] ?? "idle") : "idle"), [states]);
  return { stateOf, queue };
}
