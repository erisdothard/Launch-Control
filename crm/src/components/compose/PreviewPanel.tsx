"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { emailHtml, plainHtml } from "@/lib/email/signature";
import { signatureOf } from "@/components/inbox/sender";
import { fieldLabel, missingFields, renderMerge } from "@/lib/email/merge";
import { recipientName, type Recipient } from "./audience";
import FieldMenu from "./FieldMenu";
import MergeEditor, { type MergeEditorHandle } from "./MergeEditor";
import type { ComposerAccount, RecipientEdit } from "./types";

interface PreviewPanelProps {
  recipients: Recipient[];
  index: number;
  onIndex: (i: number) => void;
  account: ComposerAccount | undefined;
  includeSignature: boolean;
  subject: string;
  body: string;
  edits: Record<string, RecipientEdit>;
  onEdit: (key: string, edit: RecipientEdit | null) => void;
  attachmentNames: string[];
  extraFields: string[];
}

// A desktop mail client's reading width: wide enough that the signature (logo | rule | name and
// title) sits on one row, as it does in Outlook.
const EMAIL_WIDTH = 700;
const WIDE = "(min-width: 1280px)";

function emailDocument(html: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;padding:18px 18px;background:#fff;overflow-x:auto;}a{color:inherit}</style></head><body>${html}</body></html>`;
}

function subscribeWide(cb: () => void) {
  const mq = window.matchMedia(WIDE);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

const ARROW = "grid h-9 w-9 place-items-center rounded-[var(--radius-sm)] text-[var(--color-text)] shadow-[inset_0_0_0_1px_var(--color-border-bright)] transition-shadow hover:shadow-[inset_0_0_0_1px_var(--color-steel)] disabled:opacity-35";

// The exact email one person gets, merged and signed, in a white frame like their inbox. Open
// beside the message on wide screens, folded away on smaller ones.
export default function PreviewPanel({ recipients, index, onIndex, account, includeSignature, subject, body, edits, onEdit, attachmentNames, extraFields }: PreviewPanelProps) {
  const r = recipients[Math.min(index, recipients.length - 1)];
  const frame = useRef<HTMLIFrameElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const editBody = useRef<MergeEditorHandle>(null);
  const [editing, setEditing] = useState(false);
  const wide = useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE).matches, () => false);
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  const open = userOpen ?? wide;
  const [scale, setScale] = useState(1);
  const [frameWidth, setFrameWidth] = useState(EMAIL_WIDTH);
  const [docHeight, setDocHeight] = useState(300);
  const showing = open && Boolean(r);

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
  }, [showing]);

  const edit = r ? edits[r.key] : undefined;
  const subjectTemplate = edit?.subject ?? subject;
  const bodyTemplate = edit?.body ?? body;

  const rendered = useMemo(() => {
    if (!r) return null;
    const mergedSubject = renderMerge(subjectTemplate, r.values).replace(/[\r\n]+/g, " ").trim();
    const mergedBody = renderMerge(bodyTemplate, r.values).trim();
    const sig = includeSignature ? signatureOf(account) : null;
    // Campaign mail goes out with the signature as styled text and no images (send.ts).
    const html = sig ? emailHtml(mergedBody || " ", sig, "none") : plainHtml(mergedBody || " ");
    return { subject: mergedSubject, doc: emailDocument(html), missing: missingFields([subjectTemplate, bodyTemplate], r.values) };
  }, [r, subjectTemplate, bodyTemplate, account, includeSignature]);

  // Size the frame to the email, on every load and when images arrive.
  const doc = rendered?.doc;
  useEffect(() => {
    const f = frame.current;
    if (!f) return;
    const measure = () => {
      const root = f.contentDocument?.documentElement;
      if (root) setDocHeight(Math.min(1400, Math.max(200, root.scrollHeight)));
    };
    const onLoad = () => {
      measure();
      f.contentDocument?.querySelectorAll("img").forEach((img) => img.addEventListener("load", measure));
    };
    f.addEventListener("load", onLoad);
    if (f.contentDocument?.readyState === "complete") onLoad();
    return () => f.removeEventListener("load", onLoad);
  }, [doc, frameWidth, showing]);

  const n = recipients.length;
  const at = Math.min(index, Math.max(0, n - 1));
  const name = r ? recipientName(r) : "";
  const first = name.split(" ")[0];

  return (
    <section aria-label="Preview" className="card overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 sm:px-5">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setUserOpen(!open)}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-[var(--radius-sm)] py-1.5 text-left focus-visible:outline-2 focus-visible:outline-[var(--color-steel)]"
        >
          <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" className={`shrink-0 text-[var(--color-text-dim)] transition-transform ${open ? "" : "-rotate-90"}`}>
            <path d="M3 4.5l3 3 3-3" />
          </svg>
          <span className="text-[15px] font-medium text-[var(--color-text)]">Preview</span>
          {r && (
            <span className="min-w-0 truncate text-[14.5px] text-[var(--color-text-dim)]" data-user-content>
              {name}
            </span>
          )}
        </button>
        {r && n > 1 && (
          <div className="flex shrink-0 items-center gap-1.5">
            <button type="button" aria-label="Previous person" disabled={at === 0} onClick={() => onIndex(at - 1)} className={ARROW}>
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M10 3L5 8l5 5" /></svg>
            </button>
            <button type="button" aria-label="Next person" disabled={at >= n - 1} onClick={() => onIndex(at + 1)} className={ARROW}>
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M6 3l5 5-5 5" /></svg>
            </button>
          </div>
        )}
      </div>

      {open && !r && <p className="px-4 pb-4 text-[14.5px] text-[var(--color-text-dim)] sm:px-5">Add people to see it.</p>}

      {showing && r && rendered && (
        <div className="border-t border-[var(--color-border)] px-4 pt-3 pb-4 sm:px-5" data-user-content>
          <div className="text-[15px] font-semibold break-words text-[var(--color-text)]">{rendered.subject || <span className="font-normal text-[var(--color-text-dim)]">No subject</span>}</div>
          <div className="truncate text-[13.5px] text-[var(--color-text-dim)]">
            {r.email}
            {attachmentNames.length > 0 && ` · ${attachmentNames.length} ${attachmentNames.length === 1 ? "file" : "files"}`}
          </div>
          {rendered.missing.length > 0 && (
            <p className="mt-2 text-[14px] text-[var(--color-warm)]">
              No {rendered.missing.map(fieldLabel).map((l) => l.toLowerCase()).join(" or ")} for {first}
            </p>
          )}
          <div ref={box} className="mt-3 overflow-hidden rounded-[var(--radius-md)] bg-white" style={{ height: Math.ceil(docHeight * scale) }}>
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

          <div className="mt-3">
            {editing ? (
              <div className="space-y-3">
                <div>
                  <span id="edit-one-subject-label" className="mb-1.5 block text-[14px] text-[var(--color-text-dim)]">
                    Subject for {first}
                  </span>
                  <MergeEditor
                    key={`${r.key}-subject`}
                    id="edit-one-subject"
                    labelledBy="edit-one-subject-label"
                    singleLine
                    value={subjectTemplate}
                    onChange={(v) => onEdit(r.key, { subject: v, body: edit?.body ?? body })}
                  />
                </div>
                <div>
                  <div className="mb-1.5 flex items-end justify-between gap-3">
                    <span id="edit-one-label" className="text-[14px] text-[var(--color-text-dim)]">
                      Message for {first}
                    </span>
                    <FieldMenu extraFields={extraFields} onInsert={(t) => editBody.current?.insert(t)} />
                  </div>
                  <MergeEditor
                    key={r.key}
                    ref={editBody}
                    id="edit-one-body"
                    labelledBy="edit-one-label"
                    className="min-h-[160px] leading-relaxed"
                    value={bodyTemplate}
                    onChange={(v) => onEdit(r.key, { subject: edit?.subject ?? subject, body: v })}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(false)}>
                    Done
                  </button>
                  {edit && (
                    <button
                      type="button"
                      className="btn-quiet text-[14px]"
                      onClick={() => {
                        onEdit(r.key, null);
                        setEditing(false);
                      }}
                    >
                      Use the main message
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" className="btn-quiet text-[14px]" onClick={() => setEditing(true)}>
                  {edit ? `Edit ${first}'s email` : `Change for ${first} only`}
                </button>
                {edit && <span className="text-[14px] text-[var(--color-warm)]">Written for {first}</span>}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
