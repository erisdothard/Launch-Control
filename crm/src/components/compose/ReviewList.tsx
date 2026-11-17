"use client";

// A draft campaign, read, edited and sent on one screen (Max and Eris, 2026-11-16: "too much
// clicking", "no way to edit those messages easily", "no way to just send it right there").
// Every email shows in full exactly as the sender will render it. Edit turns that one email into
// text boxes in place; Remove takes the person off; the bar at the bottom picks the pace and sends.
// Send passes what was shown, and the server refuses if the list changed since.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { editDraftEmailAction, removeDraftPersonAction, sendDraftAction } from "@/app/(admin)/admin/campaigns/actions";
import { renderRecipient, type MergeValues } from "@/lib/email/merge";
import type { CampaignRecipient } from "@/lib/store/campaigns";
import { DEFAULT_DAILY_LIMIT } from "./types";
import { Spinner } from "./ui";

interface ReviewListProps {
  campaignId: string;
  fromAddress: string | null;
  subject: string;
  body: string;
  dailyLimit: number;
  /** The most this mailbox sends a day across all campaigns; the pace choices stop here. */
  mailboxCap: number;
  /** Anything else that goes out with these emails, in plain words ("A follow-up after 4 days"). */
  extras: string[];
  recipients: CampaignRecipient[];
  demo: boolean;
}

interface Email {
  id: string;
  name: string;
  company: string;
  address: string;
  merge: MergeValues;
  subject: string;
  body: string;
}

function toEmail(r: CampaignRecipient, subject: string, body: string): Email {
  return {
    id: r.id,
    name: r.merge.full_name || r.merge.company || r.email,
    company: r.merge.full_name && r.merge.company ? r.merge.company : "",
    address: r.email,
    merge: r.merge,
    ...renderRecipient(r, subject, body),
  };
}

/** Pace choices up to the mailbox's own cap, always including the campaign's current pace. */
function paceOptions(cap: number, current: number): number[] {
  const steps = [10, 20, 30, 40, 50, 100].filter((n) => n <= cap);
  return [...new Set([...steps, Math.min(current, cap)])].sort((a, b) => a - b);
}

const plural = (n: number) => `${n} ${n === 1 ? "email" : "emails"}`;

export default function ReviewList({ campaignId, fromAddress, subject, body, dailyLimit, mailboxCap, extras, recipients, demo }: ReviewListProps) {
  const router = useRouter();
  const [emails, setEmails] = useState<Email[]>(() => recipients.filter((r) => r.status === "pending").map((r) => toEmail(r, subject, body)));
  const options = paceOptions(mailboxCap, dailyLimit);
  const [limit, setLimit] = useState(options.includes(dailyLimit) ? dailyLimit : Math.min(DEFAULT_DAILY_LIMIT, mailboxCap));
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [sending, start] = useTransition();
  const n = emails.length;

  function send() {
    setError("");
    if (demo) return setError("Demo: nothing is sent.");
    start(async () => {
      const result = await sendDraftAction(
        campaignId,
        limit,
        emails.map((e) => ({ id: e.id, subject: e.subject, body: e.body }))
      );
      if (!result.ok) {
        setError(result.error);
        setConfirming(false);
      } else router.refresh();
    });
  }

  return (
    <>
      {extras.length > 0 && n > 0 && (
        <p className="mb-4 text-[15px] text-[var(--color-text-muted)]">
          Also goes out: {extras.join(" · ")}.
        </p>
      )}
      {n === 0 ? (
        <p className="card px-6 py-10 text-center text-[16px] text-[var(--color-text-muted)]">Nobody left on this list. Delete it at the top.</p>
      ) : (
        <ul className="flex flex-col gap-4 pb-28">
          {emails.map((e) => (
            <EmailCard
              key={e.id}
              email={e}
              campaignId={campaignId}
              demo={demo}
              onSaved={(next) => setEmails((list) => list.map((x) => (x.id === next.id ? next : x)))}
              onRemoved={() => setEmails((list) => list.filter((x) => x.id !== e.id))}
            />
          ))}
        </ul>
      )}

      {n > 0 && (
        <div className="fixed inset-x-0 bottom-[68px] z-40 border-t border-[var(--color-border)] bg-[var(--color-bg-sidebar)] shell:bottom-0 shell:left-60">
          <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-end gap-x-3 gap-y-3 px-4 py-4 sm:px-8">
            {error && (
              <p role="alert" className="mr-auto text-[15px] text-[var(--color-hot)]">
                {error}
              </p>
            )}
            {confirming ? (
              <>
                <span className="text-[16px] text-[var(--color-text)]">
                  Send {plural(n)}
                  {fromAddress ? ` from ${fromAddress}` : ""}?
                </span>
                <button type="button" className="btn btn-secondary" disabled={sending} onClick={() => setConfirming(false)}>
                  Cancel
                </button>
                <button type="button" className="btn btn-primary" disabled={sending} onClick={send}>
                  {sending && <Spinner />}
                  Yes, send
                </button>
              </>
            ) : (
              <>
                <label className="flex items-center gap-2 text-[15px] text-[var(--color-text-muted)]">
                  <span className="hidden sm:inline">Send</span>
                  <select aria-label="How many a day" value={limit} onChange={(ev) => setLimit(Number(ev.target.value))} className="field !w-auto !min-h-[40px] !py-1.5">
                    {options.map((d) => (
                      <option key={d} value={d}>
                        {d} a day{d === DEFAULT_DAILY_LIMIT ? " (safest)" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="button" className="btn btn-primary" onClick={() => setConfirming(true)}>
                  Send {n === 1 ? "it" : `all ${n}`}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

interface EmailCardProps {
  email: Email;
  campaignId: string;
  demo: boolean;
  onSaved: (e: Email) => void;
  onRemoved: () => void;
}

function EmailCard({ email, campaignId, demo, onSaved, onRemoved }: EmailCardProps) {
  const [editing, setEditing] = useState(false);
  const [subject, setSubject] = useState(email.subject);
  const [body, setBody] = useState(email.body);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  function save() {
    setError("");
    if (demo) return setError("Demo: nothing is saved.");
    start(async () => {
      const result = await editDraftEmailAction(campaignId, email.id, subject, body);
      if (!result.ok) return setError(result.error);
      // Shown exactly as the sender will render the saved text.
      const shown = renderRecipient({ subjectOverride: subject.replace(/[\r\n]+/g, " ").trim(), bodyOverride: body.trim(), merge: email.merge }, "", "");
      onSaved({ ...email, ...shown });
      setSubject(shown.subject);
      setBody(shown.body);
      setEditing(false);
    });
  }

  function remove() {
    if (!confirm(`Take ${email.name} off the list?`)) return;
    setError("");
    if (demo) return setError("Demo: nothing changes.");
    start(async () => {
      const result = await removeDraftPersonAction(campaignId, email.id);
      if (result.ok) onRemoved();
      else setError(result.error);
    });
  }

  return (
    <li className="card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <div className="text-[17px] font-semibold text-[var(--color-text)]">
            {email.name}
            {email.company && <span className="font-normal text-[var(--color-text-dim)]"> · {email.company}</span>}
          </div>
          <div className="truncate text-[14.5px] text-[var(--color-text-dim)]">{email.address}</div>
        </div>
        {!editing && (
          <div className="flex gap-2">
            <button type="button" className="btn btn-secondary" disabled={pending} onClick={() => setEditing(true)}>
              Edit
            </button>
            <button type="button" className="btn-quiet px-3 text-[15px]" disabled={pending} onClick={remove}>
              Remove
            </button>
          </div>
        )}
      </div>

      {editing ? (
        <div className="mt-4 flex flex-col gap-3">
          <input aria-label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} className="field font-semibold" />
          <textarea aria-label="Email" value={body} onChange={(e) => setBody(e.target.value)} rows={Math.max(8, body.split("\n").length + 2)} className="field leading-[1.6]" />
          <div className="flex gap-3">
            <button type="button" className="btn btn-primary" disabled={pending} onClick={save}>
              {pending && <Spinner />}
              Save
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={pending}
              onClick={() => {
                setSubject(email.subject);
                setBody(email.body);
                setEditing(false);
                setError("");
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4">
          <div className="text-[16px] font-semibold text-[var(--color-text)]">{email.subject}</div>
          <div className="mt-2 text-[16px] leading-[1.6] break-words whitespace-pre-wrap text-[var(--color-text-muted)]">{email.body}</div>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-3 text-[15px] text-[var(--color-hot)]">
          {error}
        </p>
      )}
    </li>
  );
}
