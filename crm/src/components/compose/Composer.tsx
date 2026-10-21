"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { formatTeamTime, sendDuration, teamLocalToUtc } from "@/lib/email/merge";
import { deleteTemplateAction, saveCampaignAction, saveTemplateAction, sendTestAction } from "@/app/(admin)/admin/campaigns/actions";
import { buildContext, evaluateAudience, leadCandidate, recipientName, type AudienceLead, type Candidate } from "./audience";
import RecipientsStep from "./RecipientsStep";
import { defaultSenderId, senderName, senderOptions } from "@/components/inbox/sender";
import MessageStep from "./MessageStep";
import SendStep, { type FollowUpDraft } from "./SendStep";
import {
  ATTACHMENT_BUCKET,
  DEFAULT_PER_MINUTE,
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

type Step = 1 | 2 | 3;

const STEPS: { n: Step; title: string; short: string; sub: string }[] = [
  { n: 1, title: "Who gets it", short: "Who", sub: "Pick the people" },
  { n: 2, title: "What it says", short: "What", sub: "Write and preview" },
  { n: 3, title: "When it goes", short: "When", sub: "Schedule and send" },
];

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
  initialStep: Step;
}

function defaultAccount(accounts: ComposerAccount[], preferred?: string | null): string {
  return defaultSenderId(senderOptions(accounts), preferred);
}

function safeName(name: string): string {
  return name.replace(/[^\w.\- ]+/g, "_").replace(/\s+/g, " ").trim().slice(0, 120) || "file";
}

export default function Composer({ leads, suppressed, accounts, templates: initialTemplates, userEmail, prefill, handoff, demo, initialStep }: ComposerProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(initialStep);
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
  const [perMinute, setPerMinute] = useState(prefill?.perMinute ?? DEFAULT_PER_MINUTE);
  const [followUp, setFollowUp] = useState<FollowUpDraft>(
    prefill?.followUp ? { enabled: true, ...prefill.followUp } : { enabled: false, days: 4, subject: "", body: "" }
  );
  const [name, setName] = useState(prefill?.name ?? "");
  const [testState, setTestState] = useState({ busy: false, message: "", error: false });
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState<"draft" | "send" | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ count: number; draft: boolean } | null>(null);
  const [dirty, setDirty] = useState(false);
  // Page-open time: the clock for the recent-contact rule and "that time has passed".
  const [openedAt] = useState(() => Date.now());

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

  const touch = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setDirty(true);
  };

  const ctx = useMemo(() => buildContext(leads, suppressed, skipDays, overrides, openedAt), [leads, suppressed, skipDays, overrides, openedAt]);
  const { included, excluded } = useMemo(() => evaluateAudience(candidates, ctx), [candidates, ctx]);
  const account = accounts.find((a) => a.id === accountId);
  const extraFields = useMemo(() => [...new Set(candidates.flatMap((c) => Object.keys(c.values)))], [candidates]);
  const previewAt = Math.min(previewIndex, Math.max(0, included.length - 1));

  const stepIssue: Record<Step, string> = {
    1: included.length === 0 ? "Add at least one person." : "",
    2: !accountId ? "Pick who it's from." : !subject.trim() ? "Add a subject." : !body.trim() ? "Write the message." : "",
    3:
      when.mode === "schedule" && !teamLocalToUtc(when.date, when.time)
        ? "Pick a date and time."
        : when.mode === "schedule" && new Date(teamLocalToUtc(when.date, when.time) ?? 0).getTime() < openedAt
          ? "That time has passed. Pick a later one."
          : followUp.enabled && !followUp.body.trim()
            ? "Write the follow-up, or turn it off."
            : uploading.length
              ? "Wait for the attachments to finish uploading."
              : "",
  };

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
      followUp: followUp.enabled ? { days: followUp.days, subject: followUp.subject, body: followUp.body } : null,
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
    if (total > MAX_TOTAL_ATTACHMENT_BYTES) return setAttachError(`Attachments would add up to more than ${MAX_TOTAL_MB} MB. Most mail servers refuse that.`);
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
    if (!r) return setTestState({ busy: false, message: "Add someone to the list first; the test is filled in as them.", error: true });
    if (!subject.trim() || !body.trim()) return setTestState({ busy: false, message: "Write a subject and message first.", error: true });
    setTestState({ busy: true, message: "", error: false });
    const e = edits[r.key];
    const result = await sendTestAction({ accountId, subject: e?.subject ?? subject, body: e?.body ?? body, values: r.values, attachments, includeSignature });
    setTestState(result.ok ? { busy: false, message: `Sent to ${result.to}. Check your inbox.`, error: false } : { busy: false, message: result.error, error: true });
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

  const scheduledIso = when.mode === "schedule" ? teamLocalToUtc(when.date, when.time) : null;
  const whenText = scheduledIso ? formatTeamTime(scheduledIso) : "Now";
  const firstIssue = ([1, 2, 3] as Step[]).find((s) => stepIssue[s]);

  if (done) {
    return (
      <div className="card relative overflow-hidden px-6 py-10 sm:px-10">
        <span aria-hidden="true" className="absolute top-0 bottom-0 left-0 flex w-[5px] flex-col">
          <i className="flex-[5] bg-[var(--color-accent)]" />
          <i className="flex-[3] bg-[var(--color-livery-orange)]" />
          <i className="flex-[2] bg-[var(--color-livery-red)]" />
        </span>
        <div className="font-display text-[18px] tracking-[0.04em] text-[var(--color-steel)]">{done.draft ? "DRAFT SAVED" : "ON ITS WAY"}</div>
        <p className="mt-3 max-w-xl text-[16px] text-[var(--color-text-muted)]">
          Demo mode: nothing was saved or sent. In the real CRM this {done.draft ? "draft" : `mass email to ${done.count} people`} now shows on the Mass email page.
        </p>
        <Link href="/admin/campaigns?demo=1" className="btn btn-secondary mt-6">
          See mass emails
        </Link>
      </div>
    );
  }

  return (
    <div className="pb-28">
      {/* Steps */}
      <ol className="mb-6 grid grid-cols-3 gap-2 sm:gap-3" aria-label="Steps">
        {STEPS.map((s) => {
          const active = s.n === step;
          const complete = s.n < step && !stepIssue[s.n];
          return (
            <li key={s.n}>
              <button
                type="button"
                aria-current={active ? "step" : undefined}
                onClick={() => setStep(s.n)}
                className={`flex w-full items-center gap-3 rounded-[var(--radius-md)] px-3 py-3 text-left transition-colors sm:px-4 ${
                  active ? "bg-[var(--color-bg-card)] shadow-[inset_0_-2px_0_var(--color-steel)]" : "hover:bg-[var(--color-bg-hover)]"
                }`}
              >
                <span
                  className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-[15px] font-semibold ${
                    active ? "bg-[var(--color-steel)] text-[var(--color-on-accent)]" : complete ? "bg-[var(--color-success)]/[0.16] text-[var(--color-success)]" : "bg-white/[0.06] text-[var(--color-text-muted)]"
                  }`}
                >
                  {complete ? (
                    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 7.5l2.5 2.5L11 4.5" /></svg>
                  ) : (
                    s.n
                  )}
                </span>
                <span className="min-w-0">
                  <span className={`block truncate text-[15px] sm:text-[16px] ${active ? "font-semibold text-[var(--color-text)]" : "text-[var(--color-text-muted)]"}`}><span className="sm:hidden">{s.short}</span>
                    <span className="hidden sm:inline">{s.title}</span>
                  </span>
                  <span className="hidden truncate text-[14px] text-[var(--color-text-dim)] sm:block">
                    {s.n === 1 && included.length > 0 ? `${included.length} ${included.length === 1 ? "person" : "people"}` : s.n === 2 && subject.trim() ? subject : s.n === 3 && step === 3 ? whenText : s.sub}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      {step === 1 && (
        <RecipientsStep
          leads={leads}
          candidates={candidates}
          included={included}
          excluded={excluded}
          skipDays={skipDays}
          onSkipDays={touch(setSkipDays)}
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
      )}

      {step === 2 && (
        <MessageStep
          accounts={accounts}
          accountId={accountId}
          onAccount={touch(setAccountId)}
          includeSignature={includeSignature}
          onIncludeSignature={touch(setIncludeSignature)}
          subject={subject}
          onSubject={touch(setSubject)}
          body={body}
          onBody={touch(setBody)}
          templates={templates}
          templateId={templateId}
          onLoadTemplate={loadTemplate}
          onSaveTemplate={saveTemplate}
          onDeleteTemplate={deleteTemplate}
          attachments={attachments}
          uploading={uploading}
          onAttach={attach}
          onRemoveAttachment={removeAttachment}
          attachError={attachError}
          recipients={included}
          extraFields={extraFields}
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
          previewIndex={previewAt}
          onPreviewIndex={setPreviewIndex}
        />
      )}

      {step === 3 && (
        <SendStep
          count={included.length}
          when={when}
          onWhen={touch(setWhen)}
          perMinute={perMinute}
          onPerMinute={touch(setPerMinute)}
          followUp={followUp}
          onFollowUp={touch(setFollowUp)}
          subject={subject}
          name={name}
          onName={touch(setName)}
          extraFields={extraFields}
          userEmail={userEmail}
          testState={testState}
          onSendTest={sendTest}
          previewName={included[previewAt] ? recipientName(included[previewAt]) : ""}
          demo={demo}
        />
      )}

      {/* Footer: back, save, and the one primary action */}
      <div className="fixed inset-x-0 bottom-[68px] z-40 border-t border-[var(--color-border)] bg-[var(--color-bg-sidebar)]/95 lg:bottom-0 lg:left-60">
        <div className="mx-auto flex max-w-[1204px] items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
          {step > 1 ? (
            <button type="button" className="btn btn-secondary" onClick={() => setStep((step - 1) as Step)}>
              Back
            </button>
          ) : (
            <Link href={demo ? "/admin/campaigns?demo=1" : "/admin/campaigns"} className="btn btn-secondary">
              Cancel
            </Link>
          )}
          <button type="button" className="btn-quiet hidden sm:inline" disabled={saving !== null} onClick={() => save("draft")}>
            {saving === "draft" ? "Saving..." : "Save as draft"}
          </button>
          <span className="ml-auto hidden min-w-0 truncate text-right text-[14.5px] text-[var(--color-text-dim)] md:block">
            {stepIssue[step] || (step === 3 ? `${included.length} ${included.length === 1 ? "person" : "people"} · ${whenText}` : "")}
          </span>
          {step < 3 ? (
            <button type="button" className="btn btn-primary ml-auto md:ml-0" onClick={() => setStep((step + 1) as Step)}>
              Next: {STEPS[step].title.toLowerCase()}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary ml-auto md:ml-0"
              onClick={() => {
                if (firstIssue) {
                  setStep(firstIssue);
                  setError(stepIssue[firstIssue]);
                  return;
                }
                setError("");
                setConfirming(true);
              }}
            >
              Review and send
            </button>
          )}
        </div>
        {error && !confirming && (
          <p role="alert" className="mx-auto max-w-[1204px] px-4 pb-3 text-[15px] text-[var(--color-hot)] sm:px-6 lg:px-8">
            {error}
          </p>
        )}
      </div>

      {confirming && (
        <div className="fixed inset-0 z-[200] grid place-items-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
          <div className="card relative w-full max-w-lg overflow-hidden p-6 shadow-[0_24px_80px_rgba(0,0,0,0.6)] sm:p-8">
            <span aria-hidden="true" className="absolute top-0 bottom-0 left-0 flex w-[5px] flex-col">
              <i className="flex-[5] bg-[var(--color-accent)]" />
              <i className="flex-[3] bg-[var(--color-livery-orange)]" />
              <i className="flex-[2] bg-[var(--color-livery-red)]" />
            </span>
            <h2 id="confirm-title" className="text-[24px] font-semibold tracking-[-0.02em] text-[var(--color-steel)]">
              {when.mode === "now" ? `Send to ${included.length} ${included.length === 1 ? "person" : "people"}?` : `Schedule for ${included.length} ${included.length === 1 ? "person" : "people"}?`}
            </h2>
            <dl className="mt-5 grid grid-cols-[110px_minmax(0,1fr)] gap-x-4 gap-y-3 text-[15.5px]">
              <dt className="text-[var(--color-text-dim)]">From</dt>
              <dd className="truncate text-[var(--color-text)]">{account ? `${senderName(account)} · ${account.address}` : "—"}</dd>
              <dt className="text-[var(--color-text-dim)]">Signature</dt>
              <dd className="text-[var(--color-text)]">{includeSignature && account?.signatureName.trim() ? `${account.signatureName}'s, under every email` : "None"}</dd>
              <dt className="text-[var(--color-text-dim)]">Subject</dt>
              <dd className="text-[var(--color-text)]">{subject}</dd>
              <dt className="text-[var(--color-text-dim)]">When</dt>
              <dd className="text-[var(--color-text)]">{scheduledIso ? `${whenText} Central` : "Starting now"}</dd>
              <dt className="text-[var(--color-text-dim)]">Pace</dt>
              <dd className="text-[var(--color-text)]">
                {perMinute} a minute, {sendDuration(included.length, perMinute)} in all
              </dd>
              <dt className="text-[var(--color-text-dim)]">Follow-up</dt>
              <dd className="text-[var(--color-text)]">{followUp.enabled ? `After ${followUp.days} days, to anyone who hasn't replied` : "None"}</dd>
              {attachments.length > 0 && (
                <>
                  <dt className="text-[var(--color-text-dim)]">Files</dt>
                  <dd className="truncate text-[var(--color-text)]">{attachments.map((a) => a.name).join(", ")}</dd>
                </>
              )}
              {excluded.length > 0 && (
                <>
                  <dt className="text-[var(--color-text-dim)]">Left out</dt>
                  <dd className="text-[var(--color-text)]">{excluded.length}, as listed in step 1</dd>
                </>
              )}
            </dl>
            <p className="mt-5 text-[15px] text-[var(--color-text-muted)]">Each person gets their own email. You can pause or cancel from the Mass email page while it sends.</p>
            {error && (
              <p role="alert" className="mt-3 text-[15px] text-[var(--color-hot)]">
                {error}
              </p>
            )}
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
              <button type="button" className="btn btn-secondary" onClick={() => setConfirming(false)} disabled={saving !== null}>
                Go back
              </button>
              <button type="button" className="btn btn-primary sm:ml-auto" onClick={() => save("send")} disabled={saving !== null}>
                {saving === "send" && <Spinner />}
                {when.mode === "now" ? `Send to ${included.length}` : "Schedule it"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
