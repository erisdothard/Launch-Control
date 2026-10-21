"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useUndoableSend } from "@/components/ui/useUndoableSend";
import { createClient } from "@/lib/supabase/client";
import type { EmailAccount } from "@/lib/store/messages";
import { ATTACHMENT_BUCKET, MAX_FILE_BYTES, MAX_FILE_MB, MAX_TOTAL_ATTACHMENT_BYTES, MAX_TOTAL_MB, type EmailAttachment } from "@/lib/email/attachments";
import { sendInboxEmailAction } from "@/app/(admin)/admin/inbox/actions";
import { discardDraftAction, sendDraftAction } from "@/app/(admin)/admin/drafts/actions";
import { splitQuoted } from "@/lib/email/signature";
import RecipientInput from "./RecipientInput";
import { SendAsSwitch, SignatureToggle } from "./SendAs";
import { cannotSendReason, defaultSenderId, senderOptions } from "./sender";
import { CloseIcon, PaperclipIcon } from "./icons";
import { fileSize } from "./url";

export type ComposerMode = "new" | "reply" | "replyAll" | "forward" | "draft";

export interface ComposerFields {
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  body: string;
}

interface ComposerProps {
  mode: ComposerMode;
  accounts: EmailAccount[];
  /** Who it goes out as to start with; Max when this one isn't on offer. */
  defaultAccountId: string;
  initial: ComposerFields;
  /** email_messages id this answers; forwards and new mail leave it empty. */
  replyToMessageId?: string | null;
  leadId?: string | null;
  draftId?: string;
  /** Keeps unsent text in this browser if the page closes. */
  storageKey?: string;
  demo?: boolean;
  /** Offer leads as you type in To (new mail and forwards). */
  searchLeads?: boolean;
  autoFocus?: boolean;
  /** Collapsed To/Cc/Subject for replies; one click opens them. */
  compactHeader?: boolean;
  /** A ready-made opening the user can drop into an empty message (a lead's outreach hook). */
  suggestion?: { label: string; body: string };
  /** False where another yellow button already leads the screen (the lead record's hero). */
  primary?: boolean;
  onSent?: () => void;
  onDiscarded?: () => void;
}

interface Upload {
  id: string;
  name: string;
  size: number;
  type: string;
  path: string | null; // null while uploading
  error?: string;
}

const BUCKET = ATTACHMENT_BUCKET;
const MAX_FILE = MAX_FILE_BYTES;
const MAX_TOTAL = MAX_TOTAL_ATTACHMENT_BYTES;

function readSaved(key: string | undefined): string | null {
  if (!key) return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSaved(key: string | undefined, body: string) {
  if (!key) return;
  try {
    if (body.trim()) window.localStorage.setItem(key, body);
    else window.localStorage.removeItem(key);
  } catch {
    // Private windows and blocked storage: the composer still works, it just won't remember.
  }
}

const SEND_LABEL: Record<ComposerMode, string> = { new: "Send", reply: "Send reply", replyAll: "Send reply", forward: "Forward", draft: "Send" };

export default function Composer({
  mode,
  accounts,
  defaultAccountId,
  initial,
  replyToMessageId,
  leadId,
  draftId,
  storageKey,
  demo,
  searchLeads,
  autoFocus,
  compactHeader,
  suggestion,
  primary = true,
  onSent,
  onDiscarded,
}: ComposerProps) {
  const router = useRouter();
  const { schedule, toast } = useUndoableSend();
  const options = senderOptions(accounts);
  const [accountId, setAccountId] = useState(() => defaultSenderId(options, defaultAccountId));
  const account = options.find((a) => a.id === accountId);
  const [includeSignature, setIncludeSignature] = useState(true);
  // A forward's original message sits under the signature, as it will in their inbox; what's
  // typed above it is the editable part.
  const [{ own: initialOwn, quoted }] = useState(() => splitQuoted(initial.body));
  const [fields, setFields] = useState<ComposerFields>(() => ({ ...initial, body: initialOwn }));
  const [showCc, setShowCc] = useState(Boolean(initial.cc));
  const [showBcc, setShowBcc] = useState(Boolean(initial.bcc));
  const [headerOpen, setHeaderOpen] = useState(!compactHeader);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [pickedLead, setPickedLead] = useState<{ leadId: string; email: string } | null>(null);
  const [phase, setPhase] = useState<"editing" | "held" | "sent">("editing");
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const formId = useId();

  // Bring back text typed earlier and not sent (drafts start from the drafted text instead).
  useEffect(() => {
    const saved = readSaved(storageKey);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore from browser storage after mount
    if (saved && !draftId) setFields((f) => ({ ...f, body: saved }));
  }, [storageKey, draftId]);

  // New mail starts in To (RecipientInput autofocuses); answers start in the message itself.
  useEffect(() => {
    if (autoFocus && mode !== "new" && mode !== "forward") bodyRef.current?.focus();
  }, [autoFocus, mode]);

  const set = (patch: Partial<ComposerFields>) => {
    setFields((f) => {
      const next = { ...f, ...patch };
      if (patch.body !== undefined) writeSaved(storageKey, next.body);
      return next;
    });
    setError(null);
  };

  const uploading = uploads.some((u) => !u.path && !u.error);
  const ready = uploads.filter((u) => u.path) as (Upload & { path: string })[];

  async function addFiles(list: FileList | null) {
    if (!list?.length) return;
    if (demo) {
      setError("This is sample data. Nothing is uploaded.");
      return;
    }
    const total = uploads.reduce((n, u) => n + u.size, 0);
    const picked = [...list];
    const tooBig = picked.find((f) => f.size > MAX_FILE);
    if (tooBig) return setError(`"${tooBig.name}" is over ${MAX_FILE_MB} MB. Share a link to it instead.`);
    if (total + picked.reduce((n, f) => n + f.size, 0) > MAX_TOTAL) return setError(`Attachments can add up to ${MAX_TOTAL_MB} MB per email.`);
    const supabase = createClient();
    const added: Upload[] = picked.map((f) => ({ id: crypto.randomUUID(), name: f.name, size: f.size, type: f.type || "application/octet-stream", path: null }));
    setUploads((u) => [...u, ...added]);
    await Promise.all(
      picked.map(async (file, i) => {
        const up = added[i];
        const safe = file.name.replace(/[^\w.\- ]+/g, "_").slice(-120) || "file";
        const path = `outbound/${up.id}/${safe}`;
        const { error: err } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: up.type, upsert: false });
        setUploads((list2) =>
          list2.map((u) => (u.id === up.id ? (err ? { ...u, error: "Didn't upload. Remove it and try again." } : { ...u, path }) : u))
        );
      })
    );
  }

  function removeUpload(id: string) {
    const target = uploads.find((u) => u.id === id);
    setUploads((u) => u.filter((x) => x.id !== id));
    if (target?.path && !demo) void createClient().storage.from(BUCKET).remove([target.path]);
  }

  function send() {
    if (phase !== "editing") return;
    if (!fields.to.trim()) return setError("Add who it's going to.");
    if (!fields.subject.trim()) {
      setHeaderOpen(true);
      return setError("Add a subject.");
    }
    if (!fields.body.trim() && !quoted) return setError("Write a message first.");
    if (uploading) return setError("Wait for the attachments to finish uploading.");
    if (uploads.some((u) => u.error)) return setError("Remove the attachment that didn't upload first.");
    const blocked = demo ? null : cannotSendReason(account);
    if (blocked) return setError(blocked);

    const snapshot = { fields, uploads };
    const attachments: EmailAttachment[] = ready.map((u) => ({ name: u.name, path: u.path, size: u.size, type: u.type }));
    const toList = fields.to.split(/[,;]/).map((s) => s.trim().toLowerCase()).filter(Boolean);
    const lead = leadId ?? (pickedLead && toList.length === 1 && toList[0] === pickedLead.email ? pickedLead.leadId : null);
    const firstTo = toList[0] ?? "";
    const body = quoted ? `${fields.body.replace(/\s+$/, "")}\n\n${quoted}` : fields.body;
    setPhase("held");
    setError(null);

    schedule(
      demo ? "Sample data: nothing will be sent" : `Sending to ${firstTo}`,
      async () => {
        if (demo) {
          setPhase("sent");
          return;
        }
        const result = draftId
          ? await sendDraftAction(draftId, {
              subject: fields.subject,
              body,
              accountId,
              includeSignature,
              to: fields.to,
              cc: fields.cc ? fields.cc.split(/[,;]/) : undefined,
              bcc: fields.bcc ? fields.bcc.split(/[,;]/) : undefined,
              attachments,
            })
          : await sendInboxEmailAction({
              accountId,
              to: fields.to,
              cc: fields.cc,
              bcc: fields.bcc,
              subject: fields.subject,
              body,
              includeSignature,
              replyToMessageId: mode === "forward" || mode === "new" ? null : (replyToMessageId ?? null),
              leadId: lead,
              attachments,
            });
        if (!result.ok) {
          setFields(snapshot.fields);
          setUploads(snapshot.uploads);
          setPhase("editing");
          setError(result.error);
          return;
        }
        writeSaved(storageKey, "");
        setPhase("sent");
        router.refresh();
        // It went out but the CRM copy didn't save: keep this on screen so nobody sends it again.
        if (result.warning) return setWarning(result.warning);
        onSent?.();
      },
      () => {
        setFields(snapshot.fields);
        setUploads(snapshot.uploads);
        setPhase("editing");
      }
    );
  }

  async function discard() {
    if (!draftId) return;
    if (demo) return onDiscarded?.();
    setPhase("held");
    try {
      await discardDraftAction(draftId);
      onDiscarded?.();
      router.refresh();
    } catch {
      setPhase("editing");
      setError("Couldn't discard that draft. Try again.");
    }
  }

  if (options.length === 0) {
    return (
      <div className="card p-6 text-[16px] text-[var(--color-text-muted)]">
        No sending address yet.{" "}
        <a href="/admin/settings#email-accounts" className="btn-quiet text-[16px] text-[var(--color-text)]">
          Connect Outlook in Settings
        </a>
        .
      </div>
    );
  }

  if (phase !== "editing") {
    return (
      <div className="card flex items-center justify-between gap-4 px-6 py-5" aria-live="polite">
        <p className="text-[16px] text-[var(--color-text-muted)]">
          {phase === "held" ? `Sending to ${fields.to.split(/[,;]/)[0]}. You can still undo.` : (warning ?? "Sent.")}
        </p>
        {phase === "sent" && mode !== "draft" && (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              setFields({ ...initial, body: "" });
              setIncludeSignature(true);
              setUploads([]);
              setWarning(null);
              setPhase("editing");
            }}
          >
            Write another
          </button>
        )}
        {toast}
      </div>
    );
  }

  const label = "shrink-0 text-[15px] text-[var(--color-text-dim)] sm:w-[68px] sm:pt-[11px]";
  const row = "flex flex-col gap-1.5 sm:flex-row sm:gap-3";
  const recipients = [fields.to, fields.cc && `Cc ${fields.cc}`].filter(Boolean).join(" · ");

  return (
    <form
      id={formId}
      className="card"
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          send();
        }
      }}
    >
      <div className="space-y-2.5 px-5 pt-5 sm:px-6">
        <SendAsSwitch options={options} value={accountId} onChange={(id) => { setAccountId(id); setError(null); }} />
        {!headerOpen ? (
          <button
            type="button"
            onClick={() => setHeaderOpen(true)}
            className="group flex w-full items-baseline gap-3 rounded-[var(--radius-sm)] py-1 text-left"
            aria-label="Show To, Cc and Subject"
          >
            <span className="text-[15px] text-[var(--color-text-dim)]">To</span>
            <span className="min-w-0 flex-1 truncate text-[15px] text-[var(--color-text)]">{recipients || "Add a recipient"}</span>
            <span className="shrink-0 text-[14px] text-[var(--color-text-muted)] group-hover:text-[var(--color-text)]">Edit</span>
          </button>
        ) : (
          <>
            <div className={row}>
              <label htmlFor={`${formId}-to`} className={label}>
                To
              </label>
              <div className="min-w-0 flex-1">
                <RecipientInput
                  id={`${formId}-to`}
                  value={fields.to}
                  onChange={(to) => set({ to })}
                  onPick={(m) => setPickedLead({ leadId: m.leadId, email: m.email.toLowerCase() })}
                  search={Boolean(searchLeads) && !demo}
                  autoFocus={autoFocus && mode !== "reply" && mode !== "replyAll" && mode !== "draft"}
                />
              </div>
              {(!showCc || !showBcc) && (
                <div className="flex shrink-0 gap-4 text-[15px] sm:pt-[11px]">
                  {!showCc && (
                    <button type="button" className="btn-quiet" onClick={() => setShowCc(true)}>
                      Cc
                    </button>
                  )}
                  {!showBcc && (
                    <button type="button" className="btn-quiet" onClick={() => setShowBcc(true)}>
                      Bcc
                    </button>
                  )}
                </div>
              )}
            </div>
            {showCc && (
              <div className={row}>
                <label htmlFor={`${formId}-cc`} className={label}>
                  Cc
                </label>
                <input id={`${formId}-cc`} value={fields.cc} onChange={(e) => set({ cc: e.target.value })} className="field" placeholder="Separate addresses with commas" />
              </div>
            )}
            {showBcc && (
              <div className={row}>
                <label htmlFor={`${formId}-bcc`} className={label}>
                  Bcc
                </label>
                <input id={`${formId}-bcc`} value={fields.bcc} onChange={(e) => set({ bcc: e.target.value })} className="field" placeholder="Hidden from the other recipients" />
              </div>
            )}
            <div className={row}>
              <label htmlFor={`${formId}-subject`} className={label}>
                Subject
              </label>
              <input id={`${formId}-subject`} value={fields.subject} onChange={(e) => set({ subject: e.target.value })} className="field" maxLength={200} />
            </div>
          </>
        )}
      </div>

      <div className="px-5 pt-3 sm:px-6">
        <label htmlFor={`${formId}-body`} className="sr-only">
          Message
        </label>
        <textarea
          id={`${formId}-body`}
          ref={bodyRef}
          value={fields.body}
          onChange={(e) => set({ body: e.target.value })}
          rows={Math.min(16, Math.max(mode === "new" || mode === "forward" ? 9 : 7, initialOwn.split("\n").length + 2))}
          placeholder={mode === "new" ? "Write your email" : mode === "forward" ? "Add a note above what you're forwarding" : "Write your reply"}
          className="field resize-y text-[16px] leading-[1.6]"
        />
        {suggestion && !fields.body.trim() && (
          <div className="mt-2 flex justify-end">
            <button type="button" className="btn-quiet text-[15px] text-[var(--color-text)]" onClick={() => set({ body: suggestion.body })}>
              {suggestion.label}
            </button>
          </div>
        )}
        <div className="mt-3">
          <SignatureToggle account={account} on={includeSignature} onChange={setIncludeSignature} />
        </div>
        {quoted && (
          <div className="mt-4">
            <p className="mb-1.5 text-[14px] text-[var(--color-text-dim)]">Included below your signature</p>
            <pre className="well max-h-64 overflow-y-auto px-4 py-3 font-[family-name:var(--font-body)] text-[15px] leading-[1.55] whitespace-pre-wrap text-[var(--color-text-muted)]">
              {quoted.trim()}
            </pre>
          </div>
        )}
      </div>

      {uploads.length > 0 && (
        <ul className="flex flex-wrap gap-2 px-5 pt-3 sm:px-6" aria-label="Attachments">
          {uploads.map((u) => (
            <li key={u.id} className="well flex items-center gap-2.5 py-2 pr-2 pl-3 text-[14px]">
              <PaperclipIcon />
              <span className="max-w-[220px] truncate text-[var(--color-text)]">{u.name}</span>
              <span className={u.error ? "text-[var(--color-hot)]" : "text-[var(--color-text-dim)]"}>
                {u.error ?? (u.path ? fileSize(u.size) : "Uploading…")}
              </span>
              <button
                type="button"
                onClick={() => removeUpload(u.id)}
                className="grid h-7 w-7 place-items-center rounded-full text-[var(--color-text-dim)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text)]"
                aria-label={`Remove ${u.name}`}
              >
                <CloseIcon />
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p role="alert" className="px-5 pt-3 text-[15px] text-[var(--color-hot)] sm:px-6">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3 px-5 py-5 sm:px-6">
        <button type="submit" className={`btn ${primary ? "btn-primary" : "btn-secondary"} min-w-[150px]`} disabled={uploading}>
          {SEND_LABEL[mode]}
        </button>
        {draftId && (
          <button type="button" className="btn btn-secondary" onClick={discard}>
            Discard
          </button>
        )}
        <button type="button" className="btn-quiet inline-flex items-center gap-2" onClick={() => fileRef.current?.click()}>
          <PaperclipIcon size={18} />
          Attach files
        </button>
        <input
          ref={fileRef}
          type="file"
          multiple
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            void addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        {!draftId && <span className="ml-auto hidden font-mono text-[14px] text-[var(--color-text-muted)] sm:inline">⌘↵ to send</span>}
      </div>
      {toast}
    </form>
  );
}
