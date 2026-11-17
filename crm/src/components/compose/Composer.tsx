"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { formatTeamTime, teamLocalToUtc } from "@/lib/email/merge";
import { deleteTemplateAction, saveCampaignAction, saveTemplateAction, sendTestAction } from "@/app/(admin)/admin/campaigns/actions";
import { buildContext, evaluateAudience, leadCandidate, type AudienceLead, type Candidate } from "./audience";
import RecipientsStep from "./RecipientsStep";
import { useAddressCheck } from "./useAddressCheck";
import { defaultSenderId, senderName, senderOptions } from "@/components/inbox/sender";
import { SignatureToggle } from "@/components/inbox/SendAs";
import MessageStep, { TemplateSave } from "./MessageStep";
import PreviewPanel from "./PreviewPanel";
import SendStep, { type FollowUpDraft } from "./SendStep";
import {
  ATTACHMENT_BUCKET,
  DEFAULT_PER_MINUTE, DEFAULT_DAILY_LIMIT,
  HANDOFF_KEY,
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_BYTES,
  MAX_FILE_MB,
  MAX_TOTAL_MB,
  MAX_TOTAL_ATTACHMENT_BYTES,
  type CampaignPayload,
  type ComposerAccount,
  type ComposerPrefill,
  type ComposerTemplate,
  type EmailAttachment,
  type RecipientEdit,
  type SendWhen,
} from "./types";
import { Spinner } from "./ui";

interface ComposerProps {
  leads: AudienceLead[];
  suppressed: string[];
  accounts: ComposerAccount[];
  templates: ComposerTemplate[];
  userEmail: string;
  prefill: ComposerPrefill | null;
  /** The Leads page left a long list in sessionStorage. */
  handoff: boolean;
  demo: boolean;
  /** Open with More options showing (?step=3, for screenshots). */
  initialOptionsOpen: boolean;
}

function defaultAccount(accounts: ComposerAccount[], preferred?: string | null): string {
  return defaultSenderId(senderOptions(accounts), preferred);
}

function safeName(name: string): string {
  return name.replace(/[^\w.\- ]+/g, "_").replace(/\s+/g, " ").trim().slice(0, 120) || "file";
}

/** "Maxwell" from "Maxwell Hartmann"; the address when nobody signs it. */
function shortSender(a: ComposerAccount | undefined): string {
  if (!a) return "";
  const n = senderName(a);
  return n.includes("@") ? n : n.split(" ")[0];
}

const ROW = "grid grid-cols-[minmax(0,1fr)] gap-1.5 border-t border-[var(--color-border)] px-4 py-3 first:border-0 sm:grid-cols-[76px_minmax(0,1fr)] sm:items-start sm:gap-3 sm:px-6";
const ROW_LABEL = "text-[15px] text-[var(--color-text-dim)] sm:pt-[9px]";

// One page: From, To, Subject, Message, a folded preview and a folded "More options". Everything
// in More options has a default, so the main path is: add people, write it, Send.
export default function Composer({ leads, suppressed, accounts, templates: initialTemplates, userEmail, prefill, handoff, demo, initialOptionsOpen }: ComposerProps) {
  const router = useRouter();
  const [candidates, setCandidates] = useState<Candidate[]>(prefill?.candidates ?? []);
  const [overrides, setOverrides] = useState<Set<string>>(new Set());
  const [skipDays, setSkipDays] = useState(prefill?.skipContactedDays ?? 0);
  const [accountId, setAccountId] = useState(() => defaultAccount(accounts, prefill?.accountId));
  const [includeSignature, setIncludeSignature] = useState(prefill?.includeSignature ?? true);
  const [subject, setSubject] = useState(prefill?.subject ?? "");
  const [body, setBody] = useState(prefill?.body ?? "");
  const [templates, setTemplates] = useState(initialTemplates);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<EmailAttachment[]>(prefill?.attachments ?? []);
  const [uploading, setUploading] = useState<string[]>([]);
  const [attachError, setAttachError] = useState("");
  const [edits, setEdits] = useState<Record<string, RecipientEdit>>(prefill?.edits ?? {});
  const [previewIndex, setPreviewIndex] = useState(0);
  const [when, setWhen] = useState<SendWhen>({ mode: "now" });
  const [perMinute] = useState(prefill?.perMinute ?? DEFAULT_PER_MINUTE);
  const [dailyLimit, setDailyLimit] = useState(prefill?.dailyLimit ?? DEFAULT_DAILY_LIMIT);
  const [followUp, setFollowUp] = useState<FollowUpDraft>(
    prefill?.followUp ? { enabled: true, ...prefill.followUp, more: prefill.followUp.more ?? [] } : { enabled: false, days: 4, subject: "", body: "", more: [] }
  );
  const [name, setName] = useState(prefill?.name ?? "");
  const [testState, setTestState] = useState({ busy: false, message: "", error: false });
  const [optionsOpen, setOptionsOpen] = useState(initialOptionsOpen);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState<"draft" | "send" | null>(null);
  /** A failed save, from the server. */
  const [error, setError] = useState("");
  /** Send was pressed with something missing: that thing, shown until it's fixed. */
  const [shownIssue, setShownIssue] = useState<string | null>(null);
  const [done, setDone] = useState<{ count: number; draft: boolean } | null>(null);
  const [dirty, setDirty] = useState(false);
  // Page-open time: the clock for the recent-contact rule and "that time has passed".
  const [openedAt] = useState(() => Date.now());
  const sendButton = useRef<HTMLButtonElement>(null);

  // A long selection from the Leads page arrives through sessionStorage.
  useEffect(() => {
    if (!handoff) return;
    try {
      const raw = sessionStorage.getItem(HANDOFF_KEY);
      sessionStorage.removeItem(HANDOFF_KEY);
      const ids: unknown = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(ids)) return;
      const byId = new Map(leads.map((l) => [l.id, l]));
      const picked = ids.flatMap((id) => (typeof id === "string" && byId.has(id) ? [leadCandidate(byId.get(id)!, "Picked on the Leads page")] : []));
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of the handoff on mount
      setCandidates((prev) => [...prev, ...picked]);
    } catch {
      // Storage blocked: the composer still opens, just empty.
    }
  }, [handoff, leads]);

  // Leaving with unsaved work asks first.
  useEffect(() => {
    if (!dirty || done) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, done]);

  // The confirm: Send takes focus, Escape backs out.
  useEffect(() => {
    if (!confirming) return;
    sendButton.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && saving === null) setConfirming(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [confirming, saving]);

  const touch = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setDirty(true);
  };

  const { undeliverable, checking } = useAddressCheck(candidates, demo);
  const ctx = useMemo(
    () => buildContext(leads, suppressed, skipDays, overrides, openedAt, undeliverable),
    [leads, suppressed, skipDays, overrides, openedAt, undeliverable]
  );
  const { included, excluded } = useMemo(() => evaluateAudience(candidates, ctx), [candidates, ctx]);
  const options = senderOptions(accounts);
  const account = accounts.find((a) => a.id === accountId);
  const extraFields = useMemo(() => [...new Set(candidates.flatMap((c) => Object.keys(c.values)))], [candidates]);
  const previewAt = Math.min(previewIndex, Math.max(0, included.length - 1));
  const scheduledIso = when.mode === "schedule" ? teamLocalToUtc(when.date, when.time) : null;
  const people = `${included.length} ${included.length === 1 ? "person" : "people"}`;

  // What stops a send, in order. `options` marks the ones fixed under More options.
  const issues: { text: string; options?: boolean }[] = [
    included.length === 0 && { text: "Add at least one person." },
    !accountId && { text: "Connect an address to send from." },
    !subject.trim() && { text: "Add a subject." },
    !body.trim() && { text: "Write the message." },
    when.mode === "schedule" && !scheduledIso && { text: "Pick a date and time.", options: true },
    when.mode === "schedule" && scheduledIso && new Date(scheduledIso).getTime() < openedAt && { text: "That time has passed.", options: true },
    followUp.enabled && (!followUp.body.trim() || followUp.more.some((m) => !m.body.trim())) && { text: "Write the follow-up, or turn it off.", options: true },
    uploading.length > 0 && { text: "Files are still uploading." },
  ].filter((x): x is { text: string; options?: boolean } => Boolean(x));

  function payload(): CampaignPayload {
    return {
      draftId: prefill?.draftId ?? null,
      name: name.trim() || subject.trim(),
      accountId,
      includeSignature,
      subject,
      body,
      attachments,
      candidates,
      overrides: [...overrides],
      edits: Object.fromEntries(Object.entries(edits).filter(([k]) => included.some((r) => r.key === k))),
      skipContactedDays: skipDays,
      when,
      perMinute,
      dailyLimit,
      followUp: followUp.enabled ? { days: followUp.days, subject: followUp.subject, body: followUp.body, more: followUp.more } : null,
    };
  }

  async function save(intent: "draft" | "send") {
    setError("");
    setSaving(intent);
    if (demo) {
      // Demo mode never writes: show the finished state as if it had saved.
      await new Promise((r) => setTimeout(r, 400));
      setSaving(null);
      setConfirming(false);
      setDone({ count: included.length, draft: intent === "draft" });
      return;
    }
    const result = await saveCampaignAction(payload(), intent);
    setSaving(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setDirty(false);
    setConfirming(false);
    router.push(`/admin/campaigns/${result.id}`);
  }

  async function attach(files: File[]) {
    setAttachError("");
    if (attachments.length + files.length > MAX_ATTACHMENTS) return setAttachError(`Attach at most ${MAX_ATTACHMENTS} files.`);
    const tooBig = files.find((f) => f.size > MAX_ATTACHMENT_BYTES);
    if (tooBig) return setAttachError(`${tooBig.name} is over ${MAX_FILE_MB} MB. Share a link to it instead.`);
    const total = [...attachments.map((a) => a.size), ...files.map((f) => f.size)].reduce((a, b) => a + b, 0);
    if (total > MAX_TOTAL_ATTACHMENT_BYTES) return setAttachError(`Files would add up to more than ${MAX_TOTAL_MB} MB.`);
    setDirty(true);
    for (const f of files) {
      const path = `campaigns/${crypto.randomUUID()}/${safeName(f.name)}`;
      const entry = { name: f.name, path, size: f.size, type: f.type || "application/octet-stream" };
      if (demo) {
        setAttachments((prev) => [...prev, entry]);
        continue;
      }
      setUploading((prev) => [...prev, f.name]);
      const { error: upError } = await createClient().storage.from(ATTACHMENT_BUCKET).upload(path, f, { contentType: entry.type, upsert: false });
      setUploading((prev) => prev.filter((n) => n !== f.name));
      if (upError) setAttachError(`Couldn't upload ${f.name}. Try again.`);
      else setAttachments((prev) => [...prev, entry]);
    }
  }

  function removeAttachment(path: string) {
    setAttachments((prev) => prev.filter((a) => a.path !== path));
    // Only files this session uploaded are removed from storage; a copied campaign's files stay.
    if (!demo && !prefill?.attachments.some((a) => a.path === path)) void createClient().storage.from(ATTACHMENT_BUCKET).remove([path]);
  }

  async function sendTest() {
    const r = included[previewAt];
    if (!r) return setTestState({ busy: false, message: "Add someone first.", error: true });
    if (!subject.trim() || !body.trim()) return setTestState({ busy: false, message: "Write a subject and message first.", error: true });
    setTestState({ busy: true, message: "", error: false });
    const e = edits[r.key];
    const result = await sendTestAction({ accountId, subject: e?.subject ?? subject, body: e?.body ?? body, values: r.values, attachments, includeSignature });
    setTestState(result.ok ? { busy: false, message: `Sent to ${result.to}.`, error: false } : { busy: false, message: result.error, error: true });
  }

  async function saveTemplate(templateName: string, id: string | null): Promise<string | null> {
    if (demo) {
      const t = { id: id ?? `demo-${Date.now()}`, name: templateName, subject, bodyText: body };
      setTemplates((prev) => [...prev.filter((x) => x.id !== t.id), t].sort((a, b) => a.name.localeCompare(b.name)));
      setTemplateId(t.id);
      return null;
    }
    const result = await saveTemplateAction({ id, name: templateName, subject, bodyText: body });
    if (!result.ok) return result.error;
    setTemplates((prev) => [...prev.filter((x) => x.id !== result.template.id), result.template].sort((a, b) => a.name.localeCompare(b.name)));
    setTemplateId(result.template.id);
    return null;
  }

  async function deleteTemplate(id: string): Promise<string | null> {
    if (!demo) {
      const result = await deleteTemplateAction(id);
      if (!result.ok) return result.error;
    }
    setTemplates((prev) => prev.filter((t) => t.id !== id));
    setTemplateId(null);
    return null;
  }

  function loadTemplate(t: ComposerTemplate) {
    if ((subject.trim() || body.trim()) && (subject !== t.subject || body !== t.bodyText) && !confirm(`Replace what you've written with “${t.name}”?`)) return;
    setSubject(t.subject);
    setBody(t.bodyText);
    setTemplateId(t.id);
    setDirty(true);
  }

  function trySend() {
    const first = issues[0];
    setError("");
    if (first) {
      if (first.options) setOptionsOpen(true);
      setShownIssue(first.text);
      return;
    }
    setShownIssue(null);
    setConfirming(true);
  }

  if (done) {
    return (
      <div className="card px-6 py-10 sm:px-10">
        <div className="font-display text-[18px] tracking-[0.04em] text-[var(--color-steel)]">{done.draft ? "SAVED" : "SENT"}</div>
        <p className="mt-3 text-[16px] text-[var(--color-text-muted)]">Demo: nothing was saved or sent.</p>
        <Link href="/admin/campaigns?demo=1" className="btn btn-secondary mt-6">
          Campaigns
        </Link>
      </div>
    );
  }

  const from = shortSender(account);
  const barMessage = error || (shownIssue && issues.some((i) => i.text === shownIssue) ? shownIssue : "");

  return (
    <div className="pb-28">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1fr)_420px] xl:gap-6">
        <section aria-label="Email" className="card self-start">
          {/* From: a choice only when there is one to make. */}
          <div className={ROW}>
            <span id="from-label" className={ROW_LABEL}>
              From
            </span>
            {options.length > 1 ? (
              <select
                aria-labelledby="from-label"
                className="field !min-h-[40px] !w-auto max-w-full justify-self-start !py-1.5"
                value={accountId}
                onChange={(e) => touch(setAccountId)(e.target.value)}
              >
                {options.map((a) => (
                  <option key={a.id} value={a.id}>
                    {senderName(a)}
                  </option>
                ))}
              </select>
            ) : options.length === 1 ? (
              <span className="text-[15.5px] text-[var(--color-text)] sm:pt-[9px]">{from}</span>
            ) : (
              <a href="/admin/settings#email-accounts" className="btn-quiet text-[15px] text-[var(--color-text)] sm:mt-[9px] sm:justify-self-start">
                Connect Outlook in Settings
              </a>
            )}
          </div>

          <div className={ROW}>
            <span id="to-label" className={ROW_LABEL}>
              To
            </span>
            <RecipientsStep
              labelId="to-label"
              leads={leads}
              candidates={candidates}
              included={included}
              excluded={excluded}
              checking={checking}
              onAdd={(add) => {
                setCandidates((prev) => [...prev, ...add]);
                setDirty(true);
              }}
              onRemove={(key) => setCandidates((prev) => prev.filter((c) => c.email.trim().toLowerCase() !== key && `lead:${c.leadId}` !== key))}
              onClear={() => {
                if (!confirm("Take everyone off the list?")) return;
                setCandidates([]);
                setOverrides(new Set());
              }}
              onOverride={(key, include) =>
                setOverrides((prev) => {
                  const next = new Set(prev);
                  if (include) next.add(key);
                  else next.delete(key);
                  return next;
                })
              }
              note={prefill?.note ?? ""}
            />
          </div>

          <MessageStep
            subject={subject}
            onSubject={touch(setSubject)}
            body={body}
            onBody={touch(setBody)}
            templates={templates}
            templateId={templateId}
            onLoadTemplate={loadTemplate}
            attachments={attachments}
            uploading={uploading}
            onAttach={attach}
            onRemoveAttachment={removeAttachment}
            attachError={attachError}
            recipients={included}
            extraFields={extraFields}
            edits={edits}
          />
        </section>

        <div className="xl:sticky xl:top-4 xl:self-start">
          <PreviewPanel
            recipients={included}
            index={previewAt}
            onIndex={setPreviewIndex}
            account={account}
            includeSignature={includeSignature}
            subject={subject}
            body={body}
            edits={edits}
            onEdit={(key, edit) => {
              setEdits((prev) => {
                const next = { ...prev };
                if (edit) next[key] = edit;
                else delete next[key];
                return next;
              });
              setDirty(true);
            }}
            attachmentNames={attachments.map((a) => a.name)}
            extraFields={extraFields}
          />
        </div>
      </div>

      <section aria-label="More options" className="card mt-4 xl:mr-[444px]">
        <button
          type="button"
          aria-expanded={optionsOpen}
          aria-controls="more-options"
          onClick={() => setOptionsOpen((o) => !o)}
          className="flex w-full items-center gap-2 rounded-[var(--radius-lg)] px-4 py-4 text-left text-[15.5px] text-[var(--color-text)] focus-visible:outline-2 focus-visible:outline-[var(--color-steel)] sm:px-6"
        >
          <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" className={`text-[var(--color-text-dim)] transition-transform ${optionsOpen ? "" : "-rotate-90"}`}>
            <path d="M3 4.5l3 3 3-3" />
          </svg>
          More options
        </button>
        {optionsOpen && (
          <div id="more-options" className="border-t border-[var(--color-border)]">
            <SendStep
              when={when}
              onWhen={touch(setWhen)}
              dailyLimit={dailyLimit}
              onDailyLimit={touch(setDailyLimit)}
              skipDays={skipDays}
              onSkipDays={touch(setSkipDays)}
              followUp={followUp}
              onFollowUp={touch(setFollowUp)}
              subject={subject}
              name={name}
              onName={touch(setName)}
              extraFields={extraFields}
              userEmail={userEmail}
              testState={testState}
              onSendTest={sendTest}
              demo={demo}
              signature={<SignatureToggle account={account} on={includeSignature} onChange={touch(setIncludeSignature)} />}
              templates={<TemplateSave templates={templates} templateId={templateId} subject={subject} onSave={saveTemplate} onDelete={deleteTemplate} />}
            />
          </div>
        )}
      </section>

      {/* Bottom bar: save for later, and the one primary action. */}
      <div className="fixed inset-x-0 bottom-[68px] z-40 border-t border-[var(--color-border)] bg-[var(--color-bg-sidebar)] shell:bottom-0 shell:left-60">
        <div className="mx-auto flex max-w-[1204px] flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:flex-nowrap sm:px-6 lg:px-8">
          <Link href={demo ? "/admin/campaigns?demo=1" : "/admin/campaigns"} className="btn-quiet hidden sm:inline">
            Cancel
          </Link>
          <span className="ml-auto" />
          {barMessage && !confirming ? (
            <p role="alert" className="order-first min-w-0 basis-full text-[14.5px] text-[var(--color-hot)] sm:order-none sm:basis-auto sm:truncate sm:text-right">
              {barMessage}
            </p>
          ) : null}
          <button type="button" className="btn btn-secondary shrink-0" disabled={saving !== null} onClick={() => save("draft")}>
            {saving === "draft" && <Spinner />}
            Save for later
          </button>
          <button type="button" className="btn btn-primary shrink-0" onClick={trySend}>
            {when.mode === "schedule" ? "Schedule" : "Send"}
          </button>
        </div>
      </div>

      {confirming && (
        <div className="fixed inset-0 z-[200] grid place-items-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
          <div className="card w-full max-w-md p-6 shadow-[0_24px_80px_rgba(0,0,0,0.6)] sm:p-7">
            <h2 id="confirm-title" className="text-[22px] font-semibold tracking-[-0.02em] text-[var(--color-text)]">
              Send to {people}
              {from ? ` from ${from}` : ""}?
            </h2>
            {scheduledIso && <p className="mt-2 text-[15.5px] text-[var(--color-text-muted)]">{formatTeamTime(scheduledIso)} Central</p>}
            {error && (
              <p role="alert" className="mt-3 text-[15px] text-[var(--color-hot)]">
                {error}
              </p>
            )}
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button type="button" className="btn btn-secondary" onClick={() => setConfirming(false)} disabled={saving !== null}>
                Cancel
              </button>
              <button ref={sendButton} type="button" className="btn btn-primary" onClick={() => save("send")} disabled={saving !== null}>
                {saving === "send" && <Spinner />}
                {when.mode === "schedule" ? "Schedule" : "Send"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
