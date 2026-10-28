"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { TodayItem } from "@/lib/store/today";
import { senderName, signatureOf, type SenderAccount } from "@/components/inbox/sender";
import Dropdown, { Chevron, Tick } from "./Dropdown";
import { Chip, type RowAct } from "./TodayRow";
import { Avatar, money, primaryLabel } from "./shared";
import { canSend } from "./groups";
import styles from "./board.module.css";

interface DraftPanelProps {
  /** Null once the queue is worked through. */
  item: TodayItem | null;
  queue: boolean;
  index: number;
  total: number;
  onStep: (delta: number) => void;
  onClose: () => void;
  body: string;
  editing: boolean;
  onBodyChange: (body: string) => void;
  error: string | null;
  notice: string | null;
  senders: SenderAccount[];
  senderId: string;
  onSender: (id: string) => void;
  signed: boolean;
  onSigned: (on: boolean) => void;
  onSend: () => void;
  onAct: (act: RowAct) => void;
  busy: boolean;
}

function Arrow({ d }: { d: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

const firstWord = (s: string) => s.split(/[\s@]/)[0];

// The slide-over: who, why we're writing, the drafted email, and Send. Back/Next walk the list (or
// the follow-up queue); From picks the sender and the signature; More holds Edit, Open, Skip.
export default function DraftPanel(p: DraftPanelProps) {
  const { item } = p;
  const nameRef = useRef<HTMLHeadingElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const sender = p.senders.find((a) => a.id === p.senderId) ?? p.senders[0];
  const sig = p.signed ? signatureOf(sender) : null;
  const sendable = item ? canSend(item) : false;

  // Each new person takes focus, so a screen reader hears who it is.
  useEffect(() => {
    if (!p.editing) nameRef.current?.focus();
  }, [item?.key, p.editing]);

  useEffect(() => {
    const t = textRef.current;
    if (!p.editing || !t) return;
    t.style.height = "auto";
    t.style.height = `${t.scrollHeight}px`;
  }, [p.editing, p.body]);

  useEffect(() => {
    const t = textRef.current;
    if (!p.editing || !t) return;
    t.focus();
    t.setSelectionRange(t.value.length, t.value.length);
  }, [p.editing, item?.key]);

  const context = item?.quote ?? item?.note ?? null;
  const recordHref = item ? `/admin/leads/${item.leadId}` : "#";

  let body: React.ReactNode;
  if (!item) {
    body = (
      <div className={styles.done}>
        <b>ALL REVIEWED</b>
        <p>{p.queue ? "Every drafted follow-up is sent or skipped." : "That one's handled."}</p>
        <button type="button" className={`${styles.btn} ${styles.secondary}`} onClick={p.onClose}>
          Back to Today
        </button>
      </div>
    );
  } else {
    const sub = [item.role, item.company].filter(Boolean).join(" · ") || item.email;
    body = (
      <>
        <div className={styles.person}>
          <Avatar name={item.name} initials={item.initials} size={44} />
          <div className="min-w-0">
            <h2 id="draft-panel-name" ref={nameRef} tabIndex={-1}>
              {item.name}
            </h2>
            <div className={styles.personSub}>
              {sub}
              {item.value != null ? ` · ${money(item.value)}` : ""}
            </div>
          </div>
          <Chip item={item} />
        </div>
        {context &&
          (item.quote ? (
            <blockquote className={`${styles.why} ${styles.quote}`}>
              “{context.text}”<small>{context.said}</small>
            </blockquote>
          ) : (
            <p className={styles.why}>
              {context.text}
              <small>{context.said}</small>
            </p>
          ))}
        {item.draft ? (
          <div className={styles.mail}>
            <dl className={styles.hdr}>
              <dt>To</dt>
              <dd>{item.draft.to || item.email}</dd>
              <dt>Subject</dt>
              <dd>{item.draft.subject}</dd>
            </dl>
            {p.editing ? (
              <textarea ref={textRef} className={styles.txt} value={p.body} onChange={(e) => p.onBodyChange(e.target.value)} aria-label="Edit the email" rows={4} />
            ) : (
              <div className={styles.txt} aria-label="Email text">
                {p.body}
              </div>
            )}
            {sig && (
              <div className={styles.sig}>
                <b>{sig.name}</b>
                {sig.title && <><br />{sig.title}</>}
                <br />
                {[sig.address, sig.phone].filter(Boolean).join(" · ")}
              </div>
            )}
          </div>
        ) : (
          <p className={styles.why}>No email drafted for {item.firstName} yet.</p>
        )}
        {p.error && (
          <p role="alert" className={styles.err}>
            That didn&apos;t send: {p.error}
          </p>
        )}
        {p.notice && <p className={styles.warn}>{p.notice}</p>}
        {sendable && sender && sender.status !== "active" && (
          <p className={styles.err}>
            {sender.address} can&apos;t send right now. <a href="/admin/settings#email-accounts" className="underline underline-offset-2">Check it in Settings</a>
          </p>
        )}
      </>
    );
  }

  const nav = p.total > 1 && item ? undefined : ({ visibility: "hidden" } as const);
  const ghost = `${styles.btn} ${styles.ghost} ${styles.sm}`;

  return createPortal(
    <>
      <div className={styles.scrim} onClick={p.onClose} aria-hidden="true" />
      <aside className={styles.panel} role="dialog" aria-modal="false" aria-labelledby={item ? "draft-panel-name" : undefined} aria-label={item ? undefined : "All reviewed"}>
        <div className={styles.pTop}>
          <div className={styles.ctx}>
            {p.queue && <b>{item ? "Reviewing follow-ups · " : "Follow-ups"}</b>}
            {item && <span className="tabular">{p.index + 1} of {p.total}</span>}
          </div>
          <button type="button" className={ghost} style={nav} aria-label="Previous" disabled={p.index <= 0} onClick={() => p.onStep(-1)}>
            <Arrow d="M10 3.5L5.5 8l4.5 4.5" />
            <span className={styles.navLbl}>Back</span>
          </button>
          <button type="button" className={ghost} style={nav} aria-label="Next" disabled={p.index >= p.total - 1} onClick={() => p.onStep(1)}>
            <span className={styles.navLbl}>Next</span>
            <Arrow d="M6 3.5L10.5 8 6 12.5" />
          </button>
          <button type="button" className={styles.iconBtn} aria-label="Close (Esc)" onClick={p.onClose}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
              <path d="M4.5 4.5l9 9M13.5 4.5l-9 9" />
            </svg>
          </button>
        </div>
        <div className={styles.pBody}>{body}</div>
        {item && (
          <div className={styles.pFoot}>
            {sendable && sender && (
              <Dropdown
                className={`${styles.btn} ${styles.secondary} ${styles.sm}`}
                menuLabel="Send from"
                placement="up-left"
                label={
                  <>
                    From: {firstWord(senderName(sender))}
                    <Chevron />
                  </>
                }
              >
                {(close) => (
                  <>
                    <div className={styles.menuLbl} aria-hidden="true">
                      Send from
                    </div>
                    {p.senders.map((a) => (
                      <button key={a.id} type="button" role="menuitemradio" aria-checked={a.id === sender.id} onClick={() => { p.onSender(a.id); close(); }}>
                        <Tick />
                        <span>
                          {senderName(a)}
                          <span className={styles.menuSub}>{a.address}</span>
                        </span>
                      </button>
                    ))}
                    {signatureOf(sender) && (
                      <>
                        <div className={styles.menuSep} role="separator" />
                        <button type="button" role="menuitemcheckbox" aria-checked={p.signed} onClick={() => p.onSigned(!p.signed)}>
                          <Tick />
                          Add my signature
                        </button>
                      </>
                    )}
                  </>
                )}
              </Dropdown>
            )}
            <Dropdown
              className={ghost}
              menuLabel="More actions"
              placement="up-left"
              label={
                <>
                  More
                  <Chevron />
                </>
              }
            >
              {(close) => (
                <>
                  {sendable && (
                    <button type="button" role="menuitem" onClick={() => { close(); p.onAct("edit"); }}>
                      {p.editing ? "Done editing" : "Edit the email"}
                    </button>
                  )}
                  <button type="button" role="menuitem" onClick={() => { close(); p.onAct("open"); }}>
                    Open their record
                  </button>
                  <button type="button" role="menuitem" onClick={() => { close(); p.onAct("skip"); }}>
                    Skip for now
                  </button>
                </>
              )}
            </Dropdown>
            <span className={styles.spacer} />
            {sendable ? (
              <>
                <span className={styles.kbd} aria-hidden="true">
                  ⌘↵
                </span>
                <button type="button" className={`${styles.btn} ${styles.primary}`} aria-keyshortcuts="Meta+Enter" onClick={p.onSend} disabled={p.busy}>
                  Send
                </button>
              </>
            ) : item.action === "call" ? (
              <a className={`${styles.btn} ${styles.primary}`} href={`tel:${item.phone.replace(/[^\d+]/g, "")}`}>
                {primaryLabel(item)}
              </a>
            ) : (
              <Link className={`${styles.btn} ${styles.primary}`} href={`${recordHref}#messages`}>
                {primaryLabel(item)}
              </Link>
            )}
          </div>
        )}
      </aside>
    </>,
    document.body
  );
}
