"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { emailHtml, plainHtml, signatureHtml, signaturePreviewHtml } from "@/lib/email/signature";
import { signatureOf } from "@/components/inbox/sender";
import { fieldLabel, missingFields, renderMerge } from "@/lib/email/merge";
import { recipientName, type Recipient } from "./audience";
import type { ComposerAccount, RecipientEdit } from "./types";
import { Avatar } from "./ui";

interface PreviewPanelProps {
  recipients: Recipient[];
  index: number;
  onIndex: (i: number) => void;
  account: ComposerAccount | undefined;
  /** The "Add signature" switch in step 2. */
  includeSignature: boolean;
  subject: string;
  body: string;
  edits: Record<string, RecipientEdit>;
  onEdit: (key: string, edit: RecipientEdit | null) => void;
  attachmentNames: string[];
}

// A desktop mail client's reading width: wide enough that the signature (logo | rule | name and
// title) sits on one row, as it does in Outlook.
const EMAIL_WIDTH = 700;

function emailDocument(html: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;padding:18px 18px;background:#fff;overflow-x:auto;}a{color:inherit}</style></head><body>${html}</body></html>`;
}

// The exact email one recipient will get: their merged subject and body, with the signature, in a
// white frame like their inbox. Arrows step through everyone on the list.
export default function PreviewPanel({ recipients, index, onIndex, account, includeSignature, subject, body, edits, onEdit, attachmentNames }: PreviewPanelProps) {
  const r = recipients[Math.min(index, recipients.length - 1)];
  const hasRecipient = Boolean(r);
  const frame = useRef<HTMLIFrameElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  // The email is laid out at a desktop mail client's width and scaled to fit the panel, so the
  // signature sits exactly as it will in Outlook instead of wrapping in a narrow column.
  const [scale, setScale] = useState(1);
  // Phones read it like a phone mail app: laid out at the panel's own width, full size.
  const [frameWidth, setFrameWidth] = useState(EMAIL_WIDTH);
  const [docHeight, setDocHeight] = useState(340);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      setFrameWidth(w < 480 ? w : EMAIL_WIDTH);
      setScale(w < 480 ? 1 : Math.min(1, w / EMAIL_WIDTH));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [hasRecipient]);

  const edit = r ? edits[r.key] : undefined;
  const subjectTemplate = edit?.subject ?? subject;
  const bodyTemplate = edit?.body ?? body;

  const rendered = useMemo(() => {
    if (!r) return null;
    const mergedSubject = renderMerge(subjectTemplate, r.values).replace(/[\r\n]+/g, " ").trim();
    const mergedBody = renderMerge(bodyTemplate, r.values).trim();
    const sig = includeSignature ? signatureOf(account) : null;
    // The CRM's own copy of the logo, so the preview shows it before the site deploy publishes it.
    const html = sig ? emailHtml(mergedBody || " ", sig).replace(signatureHtml(sig), signaturePreviewHtml(sig)) : plainHtml(mergedBody || " ");
    return { subject: mergedSubject, body: mergedBody, doc: emailDocument(html), missing: missingFields([subjectTemplate, bodyTemplate], r.values) };
  }, [r, subjectTemplate, bodyTemplate, account, includeSignature]);

  // Size the frame to the email. Measured on every load (a new srcDoc loads again) and when the
  // logo arrives; also right away, since the first load can finish before React hydrates.
  const doc = rendered?.doc;
  useEffect(() => {
    const f = frame.current;
    if (!f) return;
    const measure = () => {
      const root = f.contentDocument?.documentElement;
      if (root) setDocHeight(Math.min(1400, Math.max(260, root.scrollHeight)));
    };
    const onLoad = () => {
      measure();
      f.contentDocument?.querySelectorAll("img").forEach((img) => img.addEventListener("load", measure));
    };
    f.addEventListener("load", onLoad);
    if (f.contentDocument?.readyState === "complete") onLoad();
    return () => f.removeEventListener("load", onLoad);
  }, [doc, frameWidth]);
  if (!r || !rendered) {
    return (
      <div className="card p-6 text-[15px] text-[var(--color-text-muted)]">
        The preview shows here once there are people on the list.
      </div>
    );
  }

  const n = recipients.length;
  const at = Math.min(index, n - 1);
  const name = recipientName(r);
  // The From line people see is the company name; the person shows in the signature.
  const from = account ? `${account.displayName || "Launch Control"} <${account.address}>` : "Pick who it's from";

  return (
    <section aria-label="Preview" className="card overflow-hidden">
      <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-3 sm:px-5">
        <Avatar name={name} size={32} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold text-[var(--color-text)]">{name}</div>
          <div className="text-[14px] text-[var(--color-text-dim)]">
            Preview <span className="tabular">{at + 1}</span> of <span className="tabular">{n}</span>
          </div>
        </div>
        <div className="flex gap-1.5">
          <button
            type="button"
            aria-label="Previous person"
            disabled={at === 0}
            onClick={() => onIndex(at - 1)}
            className="grid h-10 w-10 place-items-center rounded-[var(--radius-sm)] text-[var(--color-text)] shadow-[inset_0_0_0_1px_var(--color-border-bright)] transition-shadow hover:shadow-[inset_0_0_0_1px_var(--color-steel)] disabled:opacity-35"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M10 3L5 8l5 5" /></svg>
          </button>
          <button
            type="button"
            aria-label="Next person"
            disabled={at >= n - 1}
            onClick={() => onIndex(at + 1)}
            className="grid h-10 w-10 place-items-center rounded-[var(--radius-sm)] text-[var(--color-text)] shadow-[inset_0_0_0_1px_var(--color-border-bright)] transition-shadow hover:shadow-[inset_0_0_0_1px_var(--color-steel)] disabled:opacity-35"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M6 3l5 5-5 5" /></svg>
          </button>
        </div>
      </div>

      <dl className="grid grid-cols-[64px_minmax(0,1fr)] gap-x-3 gap-y-1.5 px-4 pt-4 text-[15px] sm:px-5">
        <dt className="text-[var(--color-text-dim)]">From</dt>
        <dd className="truncate text-[var(--color-text-muted)]">{from}</dd>
        <dt className="text-[var(--color-text-dim)]">To</dt>
        <dd className="truncate text-[var(--color-text-muted)]">{r.email}</dd>
        <dt className="text-[var(--color-text-dim)]">Subject</dt>
        <dd className="font-semibold text-[var(--color-text)]">{rendered.subject || <span className="font-normal text-[var(--color-text-dim)]">No subject yet</span>}</dd>
        {attachmentNames.length > 0 && (
          <>
            <dt className="text-[var(--color-text-dim)]">Files</dt>
            <dd className="truncate text-[var(--color-text-muted)]">{attachmentNames.join(", ")}</dd>
          </>
        )}
      </dl>

      {rendered.missing.length > 0 && (
        <p className="mx-4 mt-3 rounded-[var(--radius-sm)] bg-[var(--color-warm)]/[0.1] px-3 py-2 text-[14px] text-[var(--color-warm)] sm:mx-5">
          {name} has no {rendered.missing.map(fieldLabel).map((l) => l.toLowerCase()).join(" or ")}, so that part comes out blank.
        </p>
      )}

      <div ref={box} className="mx-4 mt-4 overflow-hidden rounded-[var(--radius-md)] bg-white sm:mx-5" style={{ height: Math.ceil(docHeight * scale) }}>
        <iframe
          key={frameWidth}
          ref={frame}
          title={`Email to ${name}`}
          srcDoc={rendered.doc}
          sandbox="allow-same-origin"
          className="block origin-top-left"
          style={{ width: frameWidth, height: docHeight, transform: `scale(${scale})` }}
        />
      </div>
      <p className="px-4 pt-2 text-[13.5px] text-[var(--color-text-dim)] sm:px-5">
        {!account
          ? ""
          : !includeSignature
            ? "No signature: turned off in Add signature."
            : account.signatureName.trim()
              ? `${account.signatureName}'s signature goes under every email.`
              : "This address has no signature set. Add one in Settings."}
      </p>

      <div className="mt-3 border-t border-[var(--color-border)] px-4 py-4 sm:px-5">
        {editing ? (
          <div className="space-y-3">
            <p className="text-[15px] text-[var(--color-text-muted)]">Changes here go to {name} only.</p>
            <label className="block">
              <span className="mb-1.5 block text-[14px] text-[var(--color-text-dim)]">Subject for {name}</span>
              <input className="field" value={subjectTemplate} onChange={(e) => onEdit(r.key, { ...edit, subject: e.target.value, body: edit?.body ?? body })} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[14px] text-[var(--color-text-dim)]">Message for {name}</span>
              <textarea
                className="field min-h-[180px] leading-relaxed"
                value={bodyTemplate}
                onChange={(e) => onEdit(r.key, { subject: edit?.subject ?? subject, body: e.target.value })}
              />
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(false)}>
                Done
              </button>
              {edit && (
                <button
                  type="button"
                  className="btn-quiet"
                  onClick={() => {
                    onEdit(r.key, null);
                    setEditing(false);
                  }}
                >
                  Use the shared message again
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>
              {edit ? "Edit again" : `Edit for ${name.split(" ")[0]} only`}
            </button>
            {edit && <span className="text-[14px] text-[var(--color-warm)]">Written just for {name.split(" ")[0]}</span>}
          </div>
        )}
      </div>
    </section>
  );
}
