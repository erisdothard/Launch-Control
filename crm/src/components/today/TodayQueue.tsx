"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AdminHeader from "@/components/admin/AdminHeader";
import { useUndoableSend } from "@/components/ui/useUndoableSend";
import { sendDraftAction } from "@/app/(admin)/admin/drafts/actions";
import type { TodayItem } from "@/lib/store/today";
import { defaultSenderId, senderOptions, type SenderAccount } from "@/components/inbox/sender";
import HeroCard from "./HeroCard";
import QueueList from "./QueueList";
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

function lede(queue: TodayItem[], nextUp: string | null): React.ReactNode {
  const n = queue.length;
  const bold = (s: string) => <b className="font-semibold text-[var(--color-text)]">{s}</b>;
  if (n === 0) return <>{bold("No one is waiting on you.")}{nextUp ? ` ${nextUp}` : ""}</>;
  const who = n === 1 ? "One person is waiting on you." : `${countWord(n)} people are waiting on you.`;
  const drafted = queue.filter((i) => i.draft);
  const noun = drafted.every((i) => i.kind === "reply") ? ["reply is", "replies are"] : ["email is", "emails are"];
  const ready = drafted.length ? `${countWord(drafted.length)} ${drafted.length === 1 ? noun[0] : noun[1]} drafted.` : "";
  return <>{bold(who)} {[ready, queue[0].startHint].filter(Boolean).join(" ")}</>;
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// The Today queue: the hero, the list, and the optimistic send with Undo.
// The visible queue is derived from the server's items minus what Max has sent (or is
// holding to send), reordered by whatever he pulled to the top. Server refreshes after a
// send flow straight through, because nothing here copies the items into state.
export default function TodayQueue({ title, items, nextUp, demo, accounts }: TodayQueueProps) {
  const senders = useMemo(() => senderOptions(accounts), [accounts]);
  const [sendAs, setSendAs] = useState<Record<string, string>>({});
  const [signed, setSigned] = useState<Record<string, boolean>>({});
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set());
  const [front, setFront] = useState<string | null>(null);
  const [bodies, setBodies] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const { schedule, toast } = useUndoableSend();

  const queue = useMemo(() => {
    const left = items.filter((i) => !removed.has(i.key));
    const top = front ? left.find((i) => i.key === front) : undefined;
    return top ? [top, ...left.filter((i) => i !== top)] : left;
  }, [items, removed, front]);

  const hero = queue[0] ?? null;
  const rest = queue.slice(1);
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
    setLeaving(true);
    window.setTimeout(() => {
      mutate();
      setLeaving(false);
    }, SWAP_MS);
  }, []);

  const restore = useCallback((key: string, error?: string) => {
    setRemoved((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    setFront(key);
    if (error) setErrors((prev) => ({ ...prev, [key]: error }));
  }, []);

  const send = useCallback(() => {
    if (!hero?.draft || leaving) return;
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
    swap(() => {
      setRemoved((prev) => new Set(prev).add(key));
      setFront((f) => (f === key ? null : f));
    });
    const label = `${kind === "followup" ? "Follow-up" : kind === "new" ? "Email" : "Reply"} sent to ${name}`;
    schedule(
      label,
      async () => {
        if (demo) return;
        try {
          const result = await sendDraftAction(draft.id, { subject: draft.subject, body, accountId: accountId || undefined, includeSignature });
          if (!result.ok) restore(key, result.error);
        } catch {
          restore(key, "The server didn't answer. Try again in a minute.");
        }
      },
      () => swap(() => restore(key))
    );
  }, [hero, leaving, bodies, sendAs, signed, senders, swap, schedule, demo, restore]);

  const promote = useCallback(
    (key: string) => {
      swap(() => setFront(key));
      window.scrollTo?.({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
    },
    [swap]
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
        sendRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <AdminHeader title={title} subtitle={lede(queue, nextUp)} />
      {hero ? (
        <>
          <HeroCard
            key={hero.key}
            item={hero}
            total={queue.length}
            body={heroBody}
            editing={editing}
            leaving={leaving}
            error={heroError}
            onEditToggle={() => setEditing((e) => !e)}
            onBodyChange={(b) => setBodies((prev) => ({ ...prev, [hero.key]: b }))}
            onSend={send}
            senders={senders}
            senderId={heroSender}
            onSender={(id) => setSendAs((prev) => ({ ...prev, [hero.key]: id }))}
            includeSignature={heroSigned}
            onIncludeSignature={(on) => setSigned((prev) => ({ ...prev, [hero.key]: on }))}
          />
          <QueueList items={rest} onPromote={promote} />
        </>
      ) : (
        <section aria-label="You're clear" className={`card relative overflow-hidden ${styles.heroIn}`}>
          <LiveryRail />
          <div className="px-7 py-9 sm:px-[34px] sm:py-10">
            <p className="font-display text-[18px] tracking-[0.04em] text-[var(--color-steel)] uppercase">You&apos;re clear</p>
            <p className="mt-2.5 text-[16px] text-[var(--color-text-muted)]">
              Everything that needed you today is done. New replies will show up here.
            </p>
          </div>
        </section>
      )}
      {toast}
    </>
  );
}
