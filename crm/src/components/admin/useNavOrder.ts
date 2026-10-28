"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { normalizeOrder, NAV_KEYS, type NavKey } from "@/lib/nav/order";
import { saveNavOrderAction } from "@/app/(admin)/admin/nav-order/actions";

// The user's nav order, shared by the sidebar and the phone tab bar. localStorage (keyed by user id)
// is the working copy; the server's saved order (crm_users.nav_order, once that's switched on)
// seeds it on a new device. Storage can be missing or throw (private windows): then it's the default.

const EVENT = "lc:nav-order";
const keyFor = (userId: string) => `lc:nav-order:${userId || "anon"}`;
// Used when localStorage throws, so a reorder still holds for this page session.
const memory = new Map<string, string | null>();

function read(userId: string): string | null {
  const key = keyFor(userId);
  if (memory.has(key)) return memory.get(key) ?? null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

function parse(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function useNavOrder(userId: string, serverOrder: NavKey[] | null) {
  const raw = useSyncExternalStore(
    subscribe,
    () => read(userId),
    () => null
  );
  const order = useMemo(() => {
    const local = parse(raw);
    return normalizeOrder(local ?? serverOrder ?? NAV_KEYS);
  }, [raw, serverOrder]);

  const save = useCallback(
    (next: NavKey[] | null) => {
      const key = keyFor(userId);
      const value = next ? JSON.stringify(next) : null;
      try {
        if (value) window.localStorage.setItem(key, value);
        else window.localStorage.removeItem(key);
        memory.delete(key);
      } catch {
        memory.set(key, value);
      }
      window.dispatchEvent(new Event(EVENT));
      // Fire and forget: a no-op until NAV_ORDER_DB is switched on.
      saveNavOrderAction(next).catch(() => {});
    },
    [userId]
  );

  return { order, save };
}
