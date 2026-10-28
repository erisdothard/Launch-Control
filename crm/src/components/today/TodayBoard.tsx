"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useUndoableSend } from "@/components/ui/useUndoableSend";
import { sendDraftAction } from "@/app/(admin)/admin/drafts/actions";
import type { TodayItem } from "@/lib/store/today";
import { defaultSenderId, senderOptions, type SenderAccount } from "@/components/inbox/sender";
import Dropdown, { Chevron, Tick } from "./Dropdown";
import TodayRow, { type RowAct } from "./TodayRow";
import DraftPanel from "./DraftPanel";
import TodayHead, { type GlanceStat } from "./TodayHead";
import { canSend, FILTERS, GROUPS, groupOf, labelFor, type FilterKey, type GroupKey } from "./groups";
import styles from "./board.module.css";

interface TodayBoardProps {
  title: string;
  items: TodayItem[];
  nextUp: string | null;
  stats: GlanceStat[];
  /** Demo mode (development only): sends never reach the server. */
  demo: boolean;
  accounts: SenderAccount[];
}

interface PanelState {
  ids: string[];
  i: number;
  queue: boolean;
  /** The row that opened it, for handing focus back on close. */
  opener: string | null;
}

const LEAVE_MS = 200;

function reducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Today: everyone who needs Max, grouped, one line each. A row (or "Review & send") opens the draft
// in a slide-over; Send holds for a few seconds with Undo, then runs the existing send action. The
// list is the server's items minus what was sent or skipped here, so refreshes flow straight through.
export default function TodayBoard({ title, items, nextUp, stats, demo, accounts }: TodayBoardProps) {
  const router = useRouter();
  const senders = useMemo(() => senderOptions(accounts), [accounts]);
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set());
  const [leavingKey, setLeavingKey] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [collapsed, setCollapsed] = useState<ReadonlySet<GroupKey>>(new Set());
  const [panel, setPanel] = useState<PanelState | null>(null);
  const [editing, setEditing] = useState(false);
  const [bodies, setBodies] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sendAs, setSendAs] = useState<Record<string, string>>({});
  const [signed, setSigned] = useState<Record<string, boolean>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const busy = useRef(false);
  const { schedule, toast } = useUndoableSend();

  const queue = useMemo(() => items.filter((i) => !removed.has(i.key)), [items, removed]);
  const byKey = useMemo(() => new Map(items.map((i) => [i.key, i])), [items]);
  const test = FILTERS.find((f) => f.key === filter)!.test;
  const visible = queue.filter(test);
  const grouped = GROUPS.map((g) => ({ ...g, rows: visible.filter((i) => groupOf(i) === g.key) })).filter((g) => g.rows.length > 0);
  const followUps = queue.filter((i) => i.kind === "followup" && canSend(i));

  const currentKey = panel ? (panel.ids[panel.i] ?? null) : null;
  const current = currentKey ? (byKey.get(currentKey) ?? null) : null;

  const openRow = useCallback(
    (key: string, edit = false) => {
      const ids = grouped.filter((g) => !collapsed.has(g.key)).flatMap((g) => g.rows.map((r) => r.key));
      setPanel({ ids, i: Math.max(0, ids.indexOf(key)), queue: false, opener: key });
      setEditing(edit);
    },
    [grouped, collapsed]
  );

  const closePanel = useCallback(() => {
    const opener = panel?.opener;
    setPanel(null);
    setEditing(false);
    requestAnimationFrame(() => {
      const el = opener ? document.querySelector<HTMLElement>(`[data-open="${CSS.escape(opener)}"]`) : null;
      (el ?? document.getElementById("today-review"))?.focus();
    });
  }, [panel]);

  const step = useCallback((d: number) => {
    setEditing(false);
    setPanel((p) => (p ? { ...p, i: Math.max(0, Math.min(p.ids.length - 1, p.i + d)) } : p));
  }, []);

  // Take a row out: it slides away, then the panel moves on to whoever is next.
  const remove = useCallback((key: string) => {
    const finish = () => {
      setRemoved((prev) => new Set(prev).add(key));
      setPanel((p) => {
        if (!p) return p;
        const pos = p.ids.indexOf(key);
        if (pos < 0) return p;
        return { ...p, ids: p.ids.filter((id) => id !== key), i: pos < p.i ? p.i - 1 : p.i };
      });
      setEditing(false);
      setLeavingKey(null);
      busy.current = false;
    };
    busy.current = true;
    if (reducedMotion()) return finish();
    setLeavingKey(key);
    window.setTimeout(finish, LEAVE_MS);
  }, []);

  const restore = useCallback((key: string, error?: string) => {
    setRemoved((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    setPanel((p) => (p && !p.ids.includes(key) && (!p.queue || byKey.get(key)?.kind === "followup") ? { ...p, ids: [...p.ids.slice(0, p.i), key, ...p.ids.slice(p.i)] } : p));
    if (error) setErrors((prev) => ({ ...prev, [key]: error }));
  }, [byKey]);

  const send = useCallback(
    (key: string) => {
      const item = byKey.get(key);
      if (!item?.draft || !canSend(item) || busy.current) return;
      const draft = item.draft;
      const body = (bodies[key] ?? draft.body).trim();
      if (!body) {
        setErrors((prev) => ({ ...prev, [key]: "The email is empty." }));
        return;
      }
      const accountId = sendAs[key] ?? defaultSenderId(senders);
      const includeSignature = signed[key] ?? true;
      setErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      remove(key);
      schedule(
        `Sent to ${labelFor(item)}`,
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
        () => restore(key)
      );
    },
    [byKey, bodies, sendAs, signed, senders, remove, schedule, demo, restore]
  );

  const act = useCallback(
    (key: string, what: RowAct, fromPanel: boolean) => {
      const item = byKey.get(key);
      if (!item) return;
      if (what === "open") return router.push(`/admin/leads/${item.leadId}`);
      if (what === "skip") {
        remove(key);
        schedule(`Skipped ${labelFor(item)}`, async () => {}, () => restore(key));
        return;
      }
      if (fromPanel) setEditing((e) => !e);
      else openRow(key, true);
    },
    [byKey, router, remove, schedule, restore, openRow]
  );

  // Keyboard: Esc closes, ⌘/Ctrl+Enter sends, ←/→ (or j/k) step through the panel.
  const keys = useRef({ panel, current, editing, send, step, closePanel });
  useEffect(() => {
    keys.current = { panel, current, editing, send, step, closePanel };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = keys.current;
      if (!k.panel) return;
      const el = document.activeElement;
      const inMenu = !!el?.closest("[role=menu]");
      if (e.key === "Escape" && !inMenu) {
        e.preventDefault();
        k.closePanel();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        if (!e.repeat && k.current) k.send(k.current.key);
        return;
      }
      if (k.editing || inMenu || el?.tagName === "INPUT" || el?.tagName === "TEXTAREA" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowRight" || e.key === "j") k.step(1);
      if (e.key === "ArrowLeft" || e.key === "k") k.step(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const filterLabel = FILTERS.find((f) => f.key === filter)!.label;
  const toggleGroup = (k: GroupKey) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  return (
    <div className={`${styles.board} ${panel ? styles.open : ""}`}>
      <TodayHead title={title} queue={queue} nextUp={nextUp} stats={stats} />

      <div className={styles.toolbar}>
        <Dropdown
          className={`${styles.btn} ${styles.secondary}`}
          menuLabel="Show"
          label={
            <>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                <path d="M2 4h12M4.5 8h7M7 12h2" />
              </svg>
              Show: {filterLabel}
              <Chevron />
            </>
          }
        >
          {(close) =>
            FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                role="menuitemradio"
                aria-checked={f.key === filter}
                onClick={() => {
                  setFilter(f.key);
                  close();
                }}
              >
                <Tick />
                {f.label}
                <span className={styles.menuN}>{queue.filter(f.test).length}</span>
              </button>
            ))
          }
        </Dropdown>
        {followUps.length > 0 && (
          <div className={styles.batch}>
            <p>
              <b>
                {followUps.length} follow-up{followUps.length === 1 ? "" : "s"}
              </b>{" "}
              drafted and ready
            </p>
            <button
              id="today-review"
              type="button"
              className={`${styles.btn} ${styles.primary}`}
              onClick={() => {
                setPanel({ ids: followUps.map((i) => i.key), i: 0, queue: true, opener: null });
                setEditing(false);
              }}
            >
              Review &amp; send
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 8h10M9 4l4 4-4 4" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {notice && !panel && (
        <p role="status" className={styles.warn} style={{ margin: "0 0 10px" }}>
          {notice}
        </p>
      )}
      <section className={styles.list} aria-label="Needs you today">
        {grouped.length === 0 ? (
          <div className={styles.empty}>
            <b>YOU&apos;RE CLEAR</b>
            Nothing here needs you. New replies show up on their own.
          </div>
        ) : (
          grouped.map((g) => {
            const open = !collapsed.has(g.key);
            return (
              <div key={g.key} className={styles.group}>
                <button type="button" className={styles.ghead} aria-expanded={open} onClick={() => toggleGroup(g.key)}>
                  <i className={styles.gtick} style={{ background: g.color }} aria-hidden="true" />
                  {g.label} <span className={styles.gn}>{g.rows.length}</span>
                  <Chevron />
                </button>
                {open && (
                  <ul className={styles.rows}>
                    {g.rows.map((item) => (
                      <TodayRow
                        key={item.key}
                        item={item}
                        selected={currentKey === item.key}
                        leaving={leavingKey === item.key}
                        onOpen={() => openRow(item.key)}
                        onSend={() => send(item.key)}
                        onAct={(a) => act(item.key, a, false)}
                      />
                    ))}
                  </ul>
                )}
              </div>
            );
          })
        )}
      </section>

      {panel && (
        <DraftPanel
          item={current && !removed.has(current.key) ? current : null}
          queue={panel.queue}
          index={panel.i}
          total={panel.ids.length}
          onStep={step}
          onClose={closePanel}
          body={current?.draft ? (bodies[current.key] ?? current.draft.body) : ""}
          editing={editing}
          onBodyChange={(b) => current && setBodies((prev) => ({ ...prev, [current.key]: b }))}
          error={current ? (errors[current.key] ?? current.error) : null}
          notice={notice}
          senders={senders}
          senderId={current ? (sendAs[current.key] ?? defaultSenderId(senders)) : ""}
          onSender={(id) => current && setSendAs((prev) => ({ ...prev, [current.key]: id }))}
          signed={current ? (signed[current.key] ?? true) : true}
          onSigned={(on) => current && setSigned((prev) => ({ ...prev, [current.key]: on }))}
          onSend={() => current && send(current.key)}
          onAct={(a) => current && act(current.key, a, true)}
          busy={leavingKey !== null}
        />
      )}
      {panel ? createPortal(<div className="relative z-[125]">{toast}</div>, document.body) : toast}
    </div>
  );
}
