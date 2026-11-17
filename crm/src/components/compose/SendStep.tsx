"use client";

import { useRef, type ReactNode } from "react";
import { formatTeamTime, teamLocalToUtc } from "@/lib/email/merge";
import FieldMenu from "./FieldMenu";
import MergeEditor, { type MergeEditorHandle } from "./MergeEditor";
import { DAILY_LIMITS, MAX_EXTRA_FOLLOW_UPS, type FollowUpSettings, type FollowUpStep, type SendWhen } from "./types";
import { Spinner } from "./ui";

export interface FollowUpDraft extends FollowUpSettings {
  enabled: boolean;
}

const FOLLOW_DAYS = [2, 3, 4, 5, 7, 10, 14];
const SKIP_OPTIONS = [0, 3, 7, 14, 30, 60, 90];

const ROW = "grid grid-cols-[minmax(0,1fr)] gap-2 border-t border-[var(--color-border)] py-4 first:border-0 sm:grid-cols-[176px_minmax(0,1fr)] sm:items-center sm:gap-4";
const LABEL = "text-[15px] text-[var(--color-text-muted)]";
const SELECT = "field !w-auto";

/** One follow-up: when, an optional subject, and the message. */
function FollowUpFields({ id, step, extraFields, onChange, onRemove }: { id: string; step: FollowUpStep; extraFields: string[]; onChange: (s: Partial<FollowUpStep>) => void; onRemove?: () => void }) {
  const body = useRef<MergeEditorHandle>(null);
  return (
    <div className="well space-y-3 p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor={`${id}-days`} className={LABEL}>
          After
        </label>
        <select id={`${id}-days`} className={SELECT} value={step.days} onChange={(e) => onChange({ days: Number(e.target.value) })}>
          {FOLLOW_DAYS.map((d) => (
            <option key={d} value={d}>
              {d} days
            </option>
          ))}
        </select>
        {onRemove && (
          <button type="button" className="btn-quiet ml-auto text-[14px]" onClick={onRemove}>
            Remove
          </button>
        )}
      </div>
      <label className="block">
        <span className="sr-only">Follow-up subject</span>
        <input className="field" value={step.subject} maxLength={200} placeholder="Same subject" onChange={(e) => onChange({ subject: e.target.value })} />
      </label>
      <div>
        <div className="mb-1.5 flex items-end justify-between gap-3">
          <span id={`${id}-body-label`} className="text-[14px] text-[var(--color-text-dim)]">
            Message
          </span>
          <FieldMenu extraFields={extraFields} onInsert={(t) => body.current?.insert(t)} />
        </div>
        <MergeEditor ref={body} id={`${id}-body`} labelledBy={`${id}-body-label`} className="min-h-[120px] leading-relaxed" value={step.body} onChange={(v) => onChange({ body: v })} />
      </div>
    </div>
  );
}

interface SendStepProps {
  when: SendWhen;
  onWhen: (w: SendWhen) => void;
  dailyLimit: number;
  onDailyLimit: (n: number) => void;
  skipDays: number;
  onSkipDays: (n: number) => void;
  followUp: FollowUpDraft;
  onFollowUp: (f: FollowUpDraft) => void;
  subject: string;
  name: string;
  onName: (v: string) => void;
  extraFields: string[];
  userEmail: string;
  testState: { busy: boolean; message: string; error: boolean };
  onSendTest: () => void;
  demo: boolean;
  /** The "Add signature" switch, from the composer. */
  signature: ReactNode;
  /** Save as template, from the composer. */
  templates: ReactNode;
}

function tomorrowCentral(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date(Date.now() + 86_400_000));
}

// What sits under "More options": every setting with a default, so nothing here has to be touched.
export default function SendStep(p: SendStepProps) {
  const scheduledIso = p.when.mode === "schedule" ? teamLocalToUtc(p.when.date, p.when.time) : null;
  const fu = p.followUp;

  return (
    <div className="px-4 pb-2 sm:px-6">
      <div className={ROW}>
        <span id="when-label" className={LABEL}>
          When
        </span>
        <div className="flex flex-wrap items-center gap-3">
          <div role="radiogroup" aria-labelledby="when-label" className="inline-flex rounded-[var(--radius-md)] bg-[var(--color-bg-secondary)] p-1">
            {(["now", "schedule"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={p.when.mode === mode}
                onClick={() => p.onWhen(mode === "now" ? { mode: "now" } : { mode: "schedule", date: tomorrowCentral(), time: "09:00" })}
                className={`rounded-[var(--radius-sm)] px-4 py-2 text-[15px] transition-colors focus-visible:outline-2 focus-visible:outline-[var(--color-steel)] ${
                  p.when.mode === mode ? "bg-[var(--color-bg-card)] font-medium text-[var(--color-text)] shadow-[inset_0_0_0_1px_var(--color-steel)]" : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                }`}
              >
                {mode === "now" ? "Now" : "Pick a time"}
              </button>
            ))}
          </div>
          {p.when.mode === "schedule" && (
            <>
              <input type="date" aria-label="Send date" className={SELECT} value={p.when.date} onChange={(e) => p.when.mode === "schedule" && p.onWhen({ ...p.when, date: e.target.value })} />
              <input type="time" aria-label="Send time" className={SELECT} value={p.when.time} onChange={(e) => p.when.mode === "schedule" && p.onWhen({ ...p.when, time: e.target.value })} />
              {scheduledIso && <span className="text-[14.5px] text-[var(--color-text-dim)]">{formatTeamTime(scheduledIso)} Central</span>}
            </>
          )}
        </div>
      </div>

      <div className={ROW}>
        <label htmlFor="pace-select" className={LABEL}>
          Emails per day
        </label>
        <select id="pace-select" className={SELECT} value={p.dailyLimit} onChange={(e) => p.onDailyLimit(Number(e.target.value))}>
          {DAILY_LIMITS.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>

      <div className={ROW}>
        <label htmlFor="skip-days" className={LABEL}>
          Skip if emailed in
        </label>
        <select id="skip-days" className={SELECT} value={p.skipDays} onChange={(e) => p.onSkipDays(Number(e.target.value))}>
          {SKIP_OPTIONS.map((d) => (
            <option key={d} value={d}>
              {d === 0 ? "Don't skip" : `Last ${d} days`}
            </option>
          ))}
        </select>
      </div>

      <div className={`${ROW} sm:!items-start`}>
        <span className={`${LABEL} sm:pt-1`}>Follow-ups</span>
        <div className="space-y-3">
          <label className="flex cursor-pointer items-center gap-3 text-[15.5px] text-[var(--color-text)]">
            <input type="checkbox" className="h-[20px] w-[20px] accent-[var(--color-accent)]" checked={fu.enabled} onChange={(e) => p.onFollowUp({ ...fu, enabled: e.target.checked })} />
            Follow up if they don&rsquo;t reply
          </label>
          {fu.enabled && (
            <>
              <FollowUpFields id="fu-1" step={fu} extraFields={p.extraFields} onChange={(s) => p.onFollowUp({ ...fu, ...s })} />
              {fu.more.map((step, i) => (
                <FollowUpFields
                  key={i}
                  id={`fu-${i + 2}`}
                  step={step}
                  extraFields={p.extraFields}
                  onChange={(s) => p.onFollowUp({ ...fu, more: fu.more.map((m, j) => (j === i ? { ...m, ...s } : m)) })}
                  onRemove={() => p.onFollowUp({ ...fu, more: fu.more.filter((_, j) => j !== i) })}
                />
              ))}
              {fu.more.length < MAX_EXTRA_FOLLOW_UPS && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => p.onFollowUp({ ...fu, more: [...fu.more, { days: 5, subject: "", body: "" }] })}>
                  Add another
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <div className={`${ROW} sm:!items-start`}>
        <span className={`${LABEL} sm:pt-1`}>Signature</span>
        {p.signature}
      </div>

      <div className={ROW}>
        <label htmlFor="campaign-name" className={LABEL}>
          Campaign name
        </label>
        <input id="campaign-name" className="field" value={p.name} maxLength={120} placeholder={p.subject.replace(/\{\{[^}]*\}\}/g, "…").trim() || "Name"} onChange={(e) => p.onName(e.target.value)} />
      </div>

      <div className={ROW}>
        <span className={LABEL}>Template</span>
        {p.templates}
      </div>

      <div className={ROW}>
        <span className={LABEL}>Test</span>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn btn-secondary btn-sm" onClick={p.onSendTest} disabled={p.testState.busy || p.demo} title={p.userEmail ? `Sends one copy to ${p.userEmail}` : undefined}>
            {p.testState.busy && <Spinner />}
            Send me a test
          </button>
          {p.testState.message && (
            <span role="status" className={`text-[14.5px] ${p.testState.error ? "text-[var(--color-hot)]" : "text-[var(--color-success)]"}`}>
              {p.testState.message}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
