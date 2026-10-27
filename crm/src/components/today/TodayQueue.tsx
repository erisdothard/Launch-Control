"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AdminHeader from "@/components/admin/AdminHeader";
import { useUndoableSend } from "@/components/ui/useUndoableSend";
import { sendDraftAction } from "@/app/(admin)/admin/drafts/actions";
import type { TodayItem } from "@/lib/store/today";
import { defaultSenderId, senderOptions, type SenderAccount } from "@/components/inbox/sender";
import { WORK_LABELS } from "@/lib/store/types";
import type { TodayKind } from "@/lib/store/today";
import WorkRow from "./WorkRow";
import { countWord, LiveryRail } from "./shared";
import styles from "./today.module.css";

interface TodayQueueProps {
  title: string;
  items: TodayItem[];
  /** "Next up is Intro · Apex Track Days at 1:00." for the clear state, or null. */
  nextUp: string | null;
  /** Demo mode (development only): sends never reach the server. */
  demo: boolean;
  /** Addresses a drafted email can go out as (Max, Eris). */
  accounts: SenderAccount[];
}

const SWAP_MS = 200;

type Filter = "all" | TodayKind;
const KINDS: TodayKind[] = ["reply", "followup", "new"];

function plural(n: number, one: string, many: string): string {
  return n === 0 ? `No ${many}` : n === 1 ? `One ${one}` : `${countWord(n)} ${many}`;
}

// Three separate numbers, never one "people waiting" total: only a reply needed means someone is
// waiting on us. A follow-up is our chase; a new inquiry hasn't heard from anyone yet.
function lede(queue: TodayItem[], nextUp: string | null): React.ReactNode {
  const n = (k: TodayKind) => queue.filter((i) => i.kind === k).length;
  const bold = (s: string) => <b className="font-semibold text-[var(--color-text)]">{s}</b>;
  if (queue.length === 0) return <>{bold("Nothing needs you right now.")}{nextUp ? ` ${nextUp}` : ""}</>;
  const replies = n("reply");
  const followUps = n("followup");
  const inquiries = n("new");
  const drafted = queue.filter((i) => i.draft).length;
  const counts = [
    `${plural(replies, "reply needed", "replies needed")}.`,
    `${plural(followUps, "follow-up due", "follow-ups due")}.`,
    `${plural(inquiries, "new inquiry", "new inquiries")}.`,
  ].join(" ");
  const ready = drafted === 0 ? "" : drafted === queue.length ? (drafted === 1 ? "It's drafted." : "All are drafted.") : `${countWord(drafted)} drafted.`;
  return <>{bold(counts)} {[ready, queue[0].startHint].filter(Boolean).join(" ")}</>;
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// The Today list: everyone who needs Max, in order, one row each; the open row shows the
// conversation and the drafted email, with the optimistic send and Undo. The visible list is the
// server's items minus what Max has sent (or is holding to send). Server refreshes after a send
// flow straight through, because nothing here copies the items into state.
export default function TodayQueue({ title, items, nextUp, demo, accounts }: TodayQueueProps) {
  const senders = useMemo(() => senderOptions(accounts), [accounts]);
  const [sendAs, setSendAs] = useState<Record<string, string>>({});
  const [signed, setSigned] = useState<Record<string, boolean>>({});
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set());
  // Which row is open. Undefined: the first one in the list, so Max lands on what to do first.
  const [openKey, setOpenKey] = useState<string | null | undefined>(undefined);
  const [filter, setFilter] = useState<Filter>("all");
  const [bodies, setBodies] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState(false);
  const [leaving, setLeaving] = useState(false);
  // Set synchronously, so a second Enter in the same frame sees the card is already leaving.
  const leavingRef = useRef(false);
  const [notice, setNotice] = useState<string | null>(null);
  const { schedule, toast } = useUndoableSend();

  const queue = useMemo(() => items.filter((i) => !removed.has(i.key)), [items, removed]);
  const counts = useMemo(() => Object.fromEntries(KINDS.map((k) => [k, queue.filter((i) => i.kind === k).length])) as Record<TodayKind, number>, [queue]);
  // A filter whose rows have all been handled falls back to everything.
  const active: Filter = filter !== "all" && counts[filter] === 0 ? "all" : filter;
  const shown = active === "all" ? queue : queue.filter((i) => i.kind === active);
  const hero = (openKey === undefined ? shown[0] : shown.find((i) => i.key === openKey)) ?? null;

  const heroBody = hero?.draft ? (bodies[hero.key] ?? hero.draft.body) : "";
  const heroError = hero ? (errors[hero.key] ?? hero.error) : null;
  const heroSender = hero ? (sendAs[hero.key] ?? defaultSenderId(senders)) : "";
  const heroSigned = hero ? (signed[hero.key] ?? true) : true;

  const swap = useCallback((mutate: () => void) => {
    setEditing(false);
    if (prefersReducedMotion()) {
      mutate();
      return;
    }
    leavingRef.current = true;
    setLeaving(true);
    window.setTimeout(() => {
      mutate();
      leavingRef.current = false;
      setLeaving(false);
    }, SWAP_MS);
  }, []);

  const restore = useCallback((key: string, error?: string) => {
    setRemoved((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    setOpenKey(key);
    if (error) setErrors((prev) => ({ ...prev, [key]: error }));
  }, []);

  const send = useCallback(() => {
    if (!hero?.draft || leaving || leavingRef.current) return;
    const { key, draft, name, kind } = hero;
    const body = (bodies[key] ?? draft.body).trim();
    const accountId = sendAs[key] ?? defaultSenderId(senders);
    const includeSignature = signed[key] ?? true;
    if (!body) {
      setErrors((prev) => ({ ...prev, [key]: "The email is empty." }));
      return;
    }
    setErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    // The next person in the list opens in its place.
    const at = shown.findIndex((i) => i.key === key);
    const next = shown[at + 1] ?? shown[at - 1] ?? null;
    swap(() => {
      setRemoved((prev) => new Set(prev).add(key));
      setOpenKey(next ? next.key : null);
    });
    const label = `${kind === "followup" ? "Follow-up" : kind === "new" ? "Email" : "Reply"} sent to ${name}`;
    schedule(
      label,
      async () => {
        if (demo) return;
        try {
          const result = await sendDraftAction(draft.id, { subject: draft.subject, body, accountId: accountId || undefined, includeSignature });
          if (!result.ok) restore(key, result.error);
          else if (result.warning) setNotice(result.warning);
        } catch {
          restore(key, "The server didn't answer. Try again in a minute.");
        }
      },
      () => swap(() => restore(key))
    );
  }, [hero, shown, leaving, bodies, sendAs, signed, senders, swap, schedule, demo, restore]);

  const toggle = useCallback(
    (key: string) => {
      setEditing(false);
      setOpenKey(hero?.key === key ? null : key);
    },
    [hero]
  );

  // ⌘/Ctrl+Enter sends the hero's drafted email, even mid-edit.
  const sendRef = useRef(send);
  useEffect(() => {
    sendRef.current = send;
  }, [send]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        // Holding the keys down, or pressing again while the card animates out, must not send twice.
        if (e.repeat || leavingRef.current) return;
        sendRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <AdminHeader title={title} subtitle={lede(queue, nextUp)} />
      {notice && (
        <p role="status" className="well mb-5 px-5 py-3 text-[15px] text-[var(--color-warm)]">
          {notice}
        </p>
      )}
      {queue.length > 0 ? (
        <section aria-labelledby="today-list" className="card overflow-hidden">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 border-b border-[var(--color-border)] px-4 py-3.5 sm:px-5">
            <h2 id="today-list" className="text-[17px] font-semibold text-[var(--color-text)]">
              In order
            </h2>
            <div className="-mx-1.5 flex flex-wrap gap-x-2" role="group" aria-label="Show">
              {(["all", ...KINDS] as Filter[]).map((k) => {
                const n = k === "all" ? queue.length : counts[k];
                const label = k === "all" ? "All" : WORK_LABELS[k];
                return (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={active === k}
                    disabled={n === 0}
                    onClick={() => {
                      setFilter(k);
                      setOpenKey(undefined);
                      setEditing(false);
                    }}
                    className={`rounded-[var(--radius-sm)] px-1.5 py-1 text-[14.5px] transition-colors enabled:hover:text-[var(--color-text)] disabled:cursor-default ${
                      active === k ? "font-medium text-[var(--color-text)] underline decoration-[var(--color-steel)] underline-offset-[6px]" : "text-[var(--color-text-dim)]"
                    }`}
                  >
                    {label} <span className="tabular">{n}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <ul>
            {shown.map((item, i) => {
              const isOpen = hero?.key === item.key;
              return (
                <WorkRow
                  key={item.key}
                  item={item}
                  first={i === 0 && active === "all"}
                  open={isOpen}
                  onToggle={() => toggle(item.key)}
                  body={isOpen ? heroBody : ""}
                  editing={isOpen && editing}
                  leaving={isOpen && leaving}
                  error={isOpen ? heroError : null}
                  onEditToggle={() => setEditing((e) => !e)}
                  onBodyChange={(b) => setBodies((prev) => ({ ...prev, [item.key]: b }))}
                  onSend={send}
                  senders={senders}
                  senderId={isOpen ? heroSender : ""}
                  onSender={(id) => setSendAs((prev) => ({ ...prev, [item.key]: id }))}
                  includeSignature={isOpen ? heroSigned : true}
                  onIncludeSignature={(on) => setSigned((prev) => ({ ...prev, [item.key]: on }))}
                />
              );
            })}
          </ul>
        </section>
      ) : (
        <section aria-label="You're clear" className={`card relative overflow-hidden ${styles.heroIn}`}>
          <LiveryRail />
          <div className="px-7 py-9 sm:px-[34px] sm:py-10">
            <p className="font-display text-[18px] tracking-[0.04em] text-[var(--color-steel)] uppercase">You&apos;re clear</p>
            <p className="mt-2.5 text-[16px] text-[var(--color-text-muted)]">
              No replies needed, no follow-ups due and no new inquiries. New replies will show up here.
            </p>
          </div>
        </section>
      )}
      {toast}
    </>
  );
}
