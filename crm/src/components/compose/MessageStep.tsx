"use client";

import { useMemo, useRef, useState } from "react";
import { fieldLabel, missingFields, usedFields } from "@/lib/email/merge";
import { recipientName, type Recipient } from "./audience";
import FieldMenu from "./FieldMenu";
import PreviewPanel from "./PreviewPanel";
import type { ComposerAccount, ComposerTemplate, EmailAttachment, RecipientEdit } from "./types";
import { Spinner } from "./ui";
import { SendAsSwitch, SignatureToggle } from "@/components/inbox/SendAs";
import { senderOptions } from "@/components/inbox/sender";

interface MessageStepProps {
  accounts: ComposerAccount[];
  accountId: string;
  onAccount: (id: string) => void;
  includeSignature: boolean;
  onIncludeSignature: (on: boolean) => void;
  subject: string;
  onSubject: (v: string) => void;
  body: string;
  onBody: (v: string) => void;
  templates: ComposerTemplate[];
  templateId: string | null;
  onLoadTemplate: (t: ComposerTemplate) => void;
  onSaveTemplate: (name: string, id: string | null) => Promise<string | null>;
  onDeleteTemplate: (id: string) => Promise<string | null>;
  attachments: EmailAttachment[];
  uploading: string[];
  onAttach: (files: File[]) => void;
  onRemoveAttachment: (path: string) => void;
  attachError: string;
  recipients: Recipient[];
  extraFields: string[];
  edits: Record<string, RecipientEdit>;
  onEdit: (key: string, edit: RecipientEdit | null) => void;
  previewIndex: number;
  onPreviewIndex: (i: number) => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Step 2: what it says. From, template, subject and message with merge fields, attachments, and a
// live preview of the exact email for any one person on the list.
export default function MessageStep(p: MessageStepProps) {
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const lastFocus = useRef<"subject" | "body">("body");
  const fileRef = useRef<HTMLInputElement>(null);
  const [templateName, setTemplateName] = useState<string | null>(null);
  const [templateMsg, setTemplateMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [showMissing, setShowMissing] = useState(false);

  const loaded = p.templates.find((t) => t.id === p.templateId) ?? null;
  const account = p.accounts.find((a) => a.id === p.accountId);

  function insert(token: string) {
    const which = lastFocus.current;
    const el = which === "subject" ? subjectRef.current : bodyRef.current;
    const value = which === "subject" ? p.subject : p.body;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const next = value.slice(0, start) + token + value.slice(end);
    if (which === "subject") p.onSubject(next);
    else p.onBody(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  }

  // Who would get a blank where a field goes (no value and no fallback).
  const gaps = useMemo(() => {
    const fields = usedFields([p.subject, p.body]);
    if (fields.length === 0) return [];
    return fields
      .map((field) => ({
        field,
        people: p.recipients.filter((r) => {
          const e = p.edits[r.key];
          return missingFields([e?.subject ?? p.subject, e?.body ?? p.body], r.values).includes(field);
        }),
      }))
      .filter((g) => g.people.length > 0);
  }, [p.subject, p.body, p.recipients, p.edits]);

  async function saveTemplate(asNew: boolean) {
    const name = asNew ? (templateName ?? "").trim() : loaded?.name ?? "";
    if (!name) {
      setTemplateMsg("Give the template a name.");
      return;
    }
    setBusy(true);
    const error = await p.onSaveTemplate(name, asNew ? null : loaded?.id ?? null);
    setBusy(false);
    setTemplateMsg(error ?? (asNew ? `Saved as “${name}”.` : `Updated “${name}”.`));
    if (!error) setTemplateName(null);
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,540px)]">
      <section aria-label="Message" className="card space-y-5 p-4 sm:p-6">
        {/* Who it's from */}
        {p.accounts.length > 0 ? (
          <SendAsSwitch options={senderOptions(p.accounts)} value={p.accountId} onChange={p.onAccount} layout="stacked" />
        ) : (
          <p className="text-[15px] text-[var(--color-text-muted)]">
            Nothing to send from yet.{" "}
            <a href="/admin/settings#email-accounts" className="btn-quiet text-[15px] text-[var(--color-text)]">
              Connect Outlook in Settings
            </a>
            .
          </p>
        )}

        <div className="sm:max-w-[440px]">
          <label className="block">
            <span className="mb-1.5 block text-[14px] text-[var(--color-text-dim)]">Start from a template</span>
            <select
              className="field"
              value={p.templateId ?? ""}
              onChange={(e) => {
                const t = p.templates.find((x) => x.id === e.target.value);
                if (t) p.onLoadTemplate(t);
                setTemplateMsg("");
              }}
            >
              <option value="">{p.templates.length ? "Pick a template" : "No templates saved yet"}</option>
              {p.templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Subject */}
        <div>
          <div className="mb-1.5 flex items-end justify-between gap-3">
            <label htmlFor="mass-subject" className="text-[14px] text-[var(--color-text-dim)]">
              Subject
            </label>
            <FieldMenu extraFields={p.extraFields} onInsert={insert} />
          </div>
          <input
            id="mass-subject"
            ref={subjectRef}
            className="field text-[16px]"
            value={p.subject}
            maxLength={200}
            placeholder="A quick idea for {{company}}"
            onFocus={() => (lastFocus.current = "subject")}
            onChange={(e) => p.onSubject(e.target.value)}
          />
        </div>

        {/* Body */}
        <div>
          <label htmlFor="mass-body" className="mb-1.5 block text-[14px] text-[var(--color-text-dim)]">
            Message
          </label>
          <textarea
            id="mass-body"
            ref={bodyRef}
            className="field min-h-[300px] text-[16px] leading-relaxed"
            value={p.body}
            placeholder={"Hi {{first_name|there}},\n\n"}
            onFocus={() => (lastFocus.current = "body")}
            onChange={(e) => p.onBody(e.target.value)}
          />
          <p className="mt-2 text-[14px] text-[var(--color-text-dim)]">
            Fields in curly braces fill in for each person. <span className="font-mono text-[13px] text-[var(--color-text-muted)]">{"{{first_name|there}}"}</span> says &ldquo;there&rdquo; when someone has no first name.
          </p>
          <div className="mt-4">
            {/* From xl up the full preview sits beside the message, so the signature shows there. */}
            <SignatureToggle account={account} on={p.includeSignature} onChange={p.onIncludeSignature} previewClassName="xl:hidden" />
          </div>
        </div>

        {/* Missing-field warnings */}
        {gaps.length > 0 && (
          <div className="rounded-[var(--radius-md)] bg-[var(--color-warm)]/[0.08] px-4 py-3">
            {gaps.map((g) => (
              <p key={g.field} className="text-[15px] text-[var(--color-warm)]">
                {g.people.length} {g.people.length === 1 ? "person has" : "people have"} no {fieldLabel(g.field).toLowerCase()}. Add a fallback like{" "}
                <span className="font-mono text-[13px]">{`{{${g.field}|...}}`}</span> or edit them one by one.
              </p>
            ))}
            <button type="button" className="btn-quiet mt-1 text-[14px]" onClick={() => setShowMissing((s) => !s)}>
              {showMissing ? "Hide who" : "Show who"}
            </button>
            {showMissing && (
              <ul className="mt-2 space-y-1">
                {[...new Map(gaps.flatMap((g) => g.people).map((r) => [r.key, r])).values()].slice(0, 50).map((r) => (
                  <li key={r.key} className="flex items-center gap-3 text-[14.5px] text-[var(--color-text-muted)]">
                    <span className="min-w-0 flex-1 truncate">
                      {recipientName(r)} <span className="text-[var(--color-text-dim)]">· {r.email}</span>
                    </span>
                    <button type="button" className="btn-quiet text-[14px]" onClick={() => p.onPreviewIndex(p.recipients.findIndex((x) => x.key === r.key))}>
                      Preview
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Attachments */}
        <div className="border-t border-[var(--color-border)] pt-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[15.5px] text-[var(--color-text)]">Attachments</div>
              <div className="text-[14px] text-[var(--color-text-dim)]">Up to 10 MB each, 20 MB in all. Everyone gets the same files.</div>
            </div>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => fileRef.current?.click()}>
              Attach files
            </button>
            <input
              ref={fileRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = [...(e.target.files ?? [])];
                e.target.value = "";
                if (files.length) p.onAttach(files);
              }}
            />
          </div>
          {(p.attachments.length > 0 || p.uploading.length > 0) && (
            <ul className="mt-3 space-y-2">
              {p.attachments.map((a) => (
                <li key={a.path} className="well flex items-center gap-3 px-3 py-2.5">
                  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" className="shrink-0 text-[var(--color-text-dim)]">
                    <path d="M10.5 4.5l-5 5a1.5 1.5 0 002 2l5.5-5.5a3 3 0 00-4-4L3.5 7.5a4.5 4.5 0 006.5 6.5l4-4" />
                  </svg>
                  <span className="min-w-0 flex-1 truncate text-[15px] text-[var(--color-text)]">{a.name}</span>
                  <span className="tabular text-[14px] text-[var(--color-text-dim)]">{formatSize(a.size)}</span>
                  <button type="button" className="btn-quiet text-[14px]" onClick={() => p.onRemoveAttachment(a.path)}>
                    Remove
                  </button>
                </li>
              ))}
              {p.uploading.map((name) => (
                <li key={name} className="well flex items-center gap-3 px-3 py-2.5 text-[15px] text-[var(--color-text-muted)]">
                  <Spinner /> Uploading {name}
                </li>
              ))}
            </ul>
          )}
          {p.attachError && (
            <p role="alert" className="mt-2 text-[15px] text-[var(--color-hot)]">
              {p.attachError}
            </p>
          )}
        </div>

        {/* Templates */}
        <div className="border-t border-[var(--color-border)] pt-5">
          <div className="text-[15.5px] text-[var(--color-text)]">Templates</div>
          <div className="text-[14px] text-[var(--color-text-dim)]">Save this subject and message to reuse later.</div>
          {templateName === null ? (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setTemplateName(loaded ? `${loaded.name} (copy)` : p.subject.slice(0, 60))}>
                Save as a new template
              </button>
              {loaded && (
                <>
                  <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => saveTemplate(false)}>
                    Update &ldquo;{loaded.name}&rdquo;
                  </button>
                  <button
                    type="button"
                    className="btn-quiet text-[14px]"
                    disabled={busy}
                    onClick={async () => {
                      if (!confirm(`Delete the template “${loaded.name}”? This can’t be undone.`)) return;
                      setBusy(true);
                      const error = await p.onDeleteTemplate(loaded.id);
                      setBusy(false);
                      setTemplateMsg(error ?? `Deleted “${loaded.name}”.`);
                    }}
                  >
                    Delete template
                  </button>
                </>
              )}
            </div>
          ) : (
            <form
              className="mt-3 flex flex-wrap items-center gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                saveTemplate(true);
              }}
            >
              <label htmlFor="template-name" className="sr-only">
                Template name
              </label>
              <input id="template-name" className="field max-w-xs" autoFocus placeholder="Template name" value={templateName} onChange={(e) => setTemplateName(e.target.value)} maxLength={80} />
              <button type="submit" className="btn btn-secondary btn-sm" disabled={busy}>
                {busy ? <Spinner /> : null}
                Save
              </button>
              <button type="button" className="btn-quiet text-[14px]" onClick={() => setTemplateName(null)}>
                Cancel
              </button>
            </form>
          )}
          {templateMsg && (
            <p role="status" className="mt-2 text-[15px] text-[var(--color-text-muted)]">
              {templateMsg}
            </p>
          )}
        </div>
      </section>

      <div className="xl:sticky xl:top-4 xl:self-start">
        <PreviewPanel
          recipients={p.recipients}
          index={p.previewIndex}
          onIndex={p.onPreviewIndex}
          account={account}
          includeSignature={p.includeSignature}
          subject={p.subject}
          body={p.body}
          edits={p.edits}
          onEdit={p.onEdit}
          attachmentNames={p.attachments.map((a) => a.name)}
        />
      </div>
    </div>
  );
}
