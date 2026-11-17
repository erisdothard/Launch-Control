"use client";

import { useMemo, useRef, useState } from "react";
import { fieldLabel, missingFields, usedFields } from "@/lib/email/merge";
import type { Recipient } from "./audience";
import FieldMenu from "./FieldMenu";
import MergeEditor, { type MergeEditorHandle } from "./MergeEditor";
import type { ComposerTemplate, EmailAttachment, RecipientEdit } from "./types";
import { Spinner } from "./ui";

interface MessageStepProps {
  subject: string;
  onSubject: (v: string) => void;
  body: string;
  onBody: (v: string) => void;
  templates: ComposerTemplate[];
  templateId: string | null;
  onLoadTemplate: (t: ComposerTemplate) => void;
  attachments: EmailAttachment[];
  uploading: string[];
  onAttach: (files: File[]) => void;
  onRemoveAttachment: (path: string) => void;
  attachError: string;
  recipients: Recipient[];
  extraFields: string[];
  edits: Record<string, RecipientEdit>;
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const ROW = "grid grid-cols-[minmax(0,1fr)] gap-1.5 border-t border-[var(--color-border)] px-4 py-3 sm:grid-cols-[76px_minmax(0,1fr)] sm:items-start sm:gap-3 sm:px-6";
const ROW_LABEL = "text-[15px] text-[var(--color-text-dim)] sm:pt-[11px]";

// Subject and message, with merge fields as pills, files, and a template picker when there are any.
export default function MessageStep(p: MessageStepProps) {
  const subjectRef = useRef<MergeEditorHandle>(null);
  const bodyRef = useRef<MergeEditorHandle>(null);
  const lastFocus = useRef<"subject" | "body">("body");
  const fileRef = useRef<HTMLInputElement>(null);

  // Fields that would come out blank for someone (no value, no fallback).
  const gaps = useMemo(() => {
    const fields = usedFields([p.subject, p.body]);
    if (fields.length === 0) return [];
    return fields
      .map((field) => ({
        field,
        count: p.recipients.filter((r) => {
          const e = p.edits[r.key];
          return missingFields([e?.subject ?? p.subject, e?.body ?? p.body], r.values).includes(field);
        }).length,
      }))
      .filter((g) => g.count > 0);
  }, [p.subject, p.body, p.recipients, p.edits]);

  const insert = (token: string) => (lastFocus.current === "subject" ? subjectRef : bodyRef).current?.insert(token);

  return (
    <>
      <div className={ROW}>
        <span id="mass-subject-label" className={ROW_LABEL}>
          Subject
        </span>
        <div onFocus={() => (lastFocus.current = "subject")}>
          <MergeEditor ref={subjectRef} id="mass-subject" labelledBy="mass-subject-label" singleLine className="text-[16px]" value={p.subject} onChange={(v) => p.onSubject(v.slice(0, 200))} />
        </div>
      </div>

      <div className="border-t border-[var(--color-border)] px-4 pt-3 pb-4 sm:px-6">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <span id="mass-body-label" className="text-[15px] text-[var(--color-text-dim)]">
            Message
          </span>
          <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto">
            {p.templates.length > 0 && (
              <>
                <label htmlFor="template-pick" className="sr-only">
                  Use a template
                </label>
                <select
                  id="template-pick"
                  className="field !min-h-[36px] min-w-0 flex-1 !py-1 text-[14.5px] sm:!w-auto sm:max-w-[180px] sm:flex-none"
                  value={p.templateId ?? ""}
                  onChange={(e) => {
                    const t = p.templates.find((x) => x.id === e.target.value);
                    if (t) p.onLoadTemplate(t);
                  }}
                >
                  <option value="">Templates</option>
                  {p.templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </>
            )}
            <FieldMenu extraFields={p.extraFields} onInsert={insert} />
          </div>
        </div>
        <div onFocus={() => (lastFocus.current = "body")}>
          <MergeEditor ref={bodyRef} id="mass-body" labelledBy="mass-body-label" className="min-h-[260px] text-[16px] leading-relaxed" value={p.body} onChange={p.onBody} />
        </div>

        {gaps.length > 0 && (
          <p className="mt-2 text-[14.5px] text-[var(--color-warm)]">
            {gaps.map((g) => `${g.count} ${g.count === 1 ? "person has" : "people have"} no ${fieldLabel(g.field).toLowerCase()}`).join(". ")}
          </p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {p.attachments.map((a) => (
            <span key={a.path} className="well inline-flex max-w-full items-center gap-2 py-1 pr-1 pl-3 text-[14.5px] text-[var(--color-text)]" data-user-content>
              <span className="truncate">{a.name}</span>
              <span className="tabular text-[13.5px] text-[var(--color-text-dim)]">{formatSize(a.size)}</span>
              <button
                type="button"
                aria-label={`Remove ${a.name}`}
                onClick={() => p.onRemoveAttachment(a.path)}
                className="grid h-7 w-7 place-items-center rounded-full text-[var(--color-text-dim)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text)]"
              >
                <svg aria-hidden="true" width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M2 2l6 6M8 2l-6 6" /></svg>
              </button>
            </span>
          ))}
          {p.uploading.map((name) => (
            <span key={name} className="well inline-flex items-center gap-2 px-3 py-1.5 text-[14.5px] text-[var(--color-text-muted)]">
              <Spinner /> {name}
            </span>
          ))}
          <button type="button" className="btn-quiet inline-flex items-center gap-1.5 text-[14.5px]" onClick={() => fileRef.current?.click()}>
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
              <path d="M10.5 4.5l-5 5a1.5 1.5 0 002 2l5.5-5.5a3 3 0 00-4-4L3.5 7.5a4.5 4.5 0 006.5 6.5l4-4" />
            </svg>
            Attach
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
        {p.attachError && (
          <p role="alert" className="mt-2 text-[14.5px] text-[var(--color-hot)]">
            {p.attachError}
          </p>
        )}
      </div>
    </>
  );
}

interface TemplateSaveProps {
  templates: ComposerTemplate[];
  templateId: string | null;
  subject: string;
  onSave: (name: string, id: string | null) => Promise<string | null>;
  onDelete: (id: string) => Promise<string | null>;
}

/** Save this subject and message as a template, or update/delete the one loaded. Lives in More options. */
export function TemplateSave({ templates, templateId, subject, onSave, onDelete }: TemplateSaveProps) {
  const [name, setName] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const loaded = templates.find((t) => t.id === templateId) ?? null;

  async function save(asNew: boolean) {
    const n = asNew ? (name ?? "").trim() : loaded?.name ?? "";
    if (!n) return setMsg("Give it a name.");
    setBusy(true);
    const error = await onSave(n, asNew ? null : loaded?.id ?? null);
    setBusy(false);
    setMsg(error ?? "Saved.");
    if (!error) setName(null);
  }

  return (
    <div>
      {name === null ? (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setName(loaded ? `${loaded.name} (copy)` : subject.replace(/\{\{[^}]*\}\}/g, "").trim().slice(0, 60))}>
            Save as template
          </button>
          {loaded && (
            <>
              <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => save(false)}>
                Update &ldquo;{loaded.name}&rdquo;
              </button>
              <button
                type="button"
                className="btn-quiet text-[14px]"
                disabled={busy}
                onClick={async () => {
                  if (!confirm(`Delete the template “${loaded.name}”?`)) return;
                  setBusy(true);
                  const error = await onDelete(loaded.id);
                  setBusy(false);
                  setMsg(error ?? "Deleted.");
                }}
              >
                Delete
              </button>
            </>
          )}
        </div>
      ) : (
        <form
          className="flex flex-wrap items-center gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void save(true);
          }}
        >
          <label htmlFor="template-name" className="sr-only">
            Template name
          </label>
          <input id="template-name" className="field max-w-xs" autoFocus placeholder="Template name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          <button type="submit" className="btn btn-secondary btn-sm" disabled={busy}>
            {busy ? <Spinner /> : null}
            Save
          </button>
          <button type="button" className="btn-quiet text-[14px]" onClick={() => setName(null)}>
            Cancel
          </button>
        </form>
      )}
      {msg && (
        <p role="status" className="mt-2 text-[14.5px] text-[var(--color-text-muted)]">
          {msg}
        </p>
      )}
    </div>
  );
}
