"use client";

import { formatTeamTime, sendDuration, teamLocalToUtc } from "@/lib/email/merge";
import FieldMenu from "./FieldMenu";
import { MAX_PER_MINUTE, type SendWhen } from "./types";
import { Spinner } from "./ui";

export interface FollowUpDraft {
  enabled: boolean;
  days: number;
  subject: string;
  body: string;
}

interface SendStepProps {
  count: number;
  when: SendWhen;
  onWhen: (w: SendWhen) => void;
  perMinute: number;
  onPerMinute: (n: number) => void;
  followUp: FollowUpDraft;
  onFollowUp: (f: FollowUpDraft) => void;
  subject: string;
  name: string;
  onName: (v: string) => void;
  extraFields: string[];
  userEmail: string;
  testState: { busy: boolean; message: string; error: boolean };
  onSendTest: () => void;
  previewName: string;
  demo: boolean;
}

const PACES = [5, 10, 15, 20, MAX_PER_MINUTE];
const FOLLOW_DAYS = [2, 3, 4, 5, 7, 10, 14];

function RadioCard({ checked, onSelect, title, sub, children }: { checked: boolean; onSelect: () => void; title: string; sub: string; children?: React.ReactNode }) {
  return (
    <label
      className={`block cursor-pointer rounded-[var(--radius-md)] p-4 transition-shadow ${
        checked ? "bg-[var(--color-bg-secondary)] shadow-[inset_0_0_0_1px_var(--color-steel)]" : "shadow-[inset_0_0_0_1px_var(--color-border-bright)] hover:shadow-[inset_0_0_0_1px_var(--color-text-dim)]"
      }`}
    >
      <span className="flex items-start gap-3">
        <input type="radio" checked={checked} onChange={onSelect} className="mt-1 h-[18px] w-[18px] accent-[var(--color-accent)]" />
        <span className="min-w-0 flex-1">
          <span className="block text-[16px] font-medium text-[var(--color-text)]">{title}</span>
          <span className="block text-[14.5px] text-[var(--color-text-muted)]">{sub}</span>
          {checked && children}
        </span>
      </span>
    </label>
  );
}

// Step 3: when it goes, how fast, and whether a follow-up chases the people who don't answer.
export default function SendStep(p: SendStepProps) {
  const scheduledIso = p.when.mode === "schedule" ? teamLocalToUtc(p.when.date, p.when.time) : null;
  const fu = p.followUp;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-6">
        <section aria-labelledby="when" className="card p-4 sm:p-6">
          <h2 id="when" className="text-[17px] font-semibold text-[var(--color-text)]">
            When it goes
          </h2>
          <div className="mt-4 space-y-3">
            <RadioCard checked={p.when.mode === "now"} onSelect={() => p.onWhen({ mode: "now" })} title="Send now" sub="Starts within a minute of confirming." />
            <RadioCard
              checked={p.when.mode === "schedule"}
              onSelect={() => {
                const t = new Date(Date.now() + 86_400_000);
                const date = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(t);
                p.onWhen({ mode: "schedule", date, time: "09:00" });
              }}
              title="Schedule it"
              sub="Pick a day and time. Central time, like the rest of the CRM."
            >
              {p.when.mode === "schedule" && (
                <span className="mt-3 flex flex-wrap gap-3">
                  <input
                    type="date"
                    aria-label="Send date"
                    className="field !w-auto"
                    value={p.when.date}
                    onChange={(e) => p.when.mode === "schedule" && p.onWhen({ ...p.when, date: e.target.value })}
                  />
                  <input
                    type="time"
                    aria-label="Send time"
                    className="field !w-auto"
                    value={p.when.time}
                    onChange={(e) => p.when.mode === "schedule" && p.onWhen({ ...p.when, time: e.target.value })}
                  />
                  {scheduledIso && <span className="basis-full text-[14.5px] text-[var(--color-text-muted)]">{formatTeamTime(scheduledIso)} Central</span>}
                </span>
              )}
            </RadioCard>
          </div>
        </section>

        <section aria-labelledby="pace" className="card p-4 sm:p-6">
          <h2 id="pace" className="text-[17px] font-semibold text-[var(--color-text)]">
            How fast
          </h2>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label htmlFor="pace-select" className="text-[15px] text-[var(--color-text-muted)]">
              One email at a time,
            </label>
            <select id="pace-select" className="field !w-auto" value={p.perMinute} onChange={(e) => p.onPerMinute(Number(e.target.value))}>
              {PACES.map((n) => (
                <option key={n} value={n}>
                  {n} a minute{n === 10 ? " (recommended)" : ""}
                </option>
              ))}
            </select>
          </div>
          <p className="mt-3 text-[15px] text-[var(--color-text-muted)]">
            {p.count > 0 ? `${p.count} ${p.count === 1 ? "email takes" : "emails take"} ${sendDuration(p.count, p.perMinute)}. ` : ""}
            Microsoft flags mailboxes that send a lot at once, which can land your mail in spam. Slower is safer.
          </p>
        </section>

        <section aria-labelledby="test" className="card p-4 sm:p-6">
          <h2 id="test" className="text-[17px] font-semibold text-[var(--color-text)]">
            See it in your inbox first
          </h2>
          <p className="mt-1 text-[15px] text-[var(--color-text-muted)]">
            Sends one copy, filled in as {p.previewName || "the first person"}, to {p.userEmail || "you"}. Nobody else gets it.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button type="button" className="btn btn-secondary" onClick={p.onSendTest} disabled={p.testState.busy || p.demo}>
              {p.testState.busy && <Spinner />}
              Send a test to me
            </button>
            {p.demo && <span className="text-[14px] text-[var(--color-text-dim)]">Off in demo mode.</span>}
          </div>
          {p.testState.message && (
            <p role="status" className={`mt-2 text-[15px] ${p.testState.error ? "text-[var(--color-hot)]" : "text-[var(--color-success)]"}`}>
              {p.testState.message}
            </p>
          )}
        </section>
      </div>

      <div className="space-y-6">
        <section aria-labelledby="follow-up" className="card p-4 sm:p-6">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 h-[20px] w-[20px] accent-[var(--color-accent)]"
              checked={fu.enabled}
              onChange={(e) => p.onFollowUp({ ...fu, enabled: e.target.checked })}
            />
            <span>
              <span id="follow-up" className="block text-[17px] font-semibold text-[var(--color-text)]">
                Follow up with anyone who doesn&rsquo;t reply
              </span>
              <span className="block text-[15px] text-[var(--color-text-muted)]">
                A short nudge in the same thread. Anyone who replies, opts out, or hears from you another way is skipped.
              </span>
            </span>
          </label>
          {fu.enabled && (
            <div className="mt-4 space-y-4 pl-8">
              <div className="flex flex-wrap items-center gap-3">
                <label htmlFor="fu-days" className="text-[15px] text-[var(--color-text-muted)]">
                  Send it after
                </label>
                <select id="fu-days" className="field !w-auto" value={fu.days} onChange={(e) => p.onFollowUp({ ...fu, days: Number(e.target.value) })}>
                  {FOLLOW_DAYS.map((d) => (
                    <option key={d} value={d}>
                      {d} days
                    </option>
                  ))}
                </select>
                <span className="text-[15px] text-[var(--color-text-muted)]">with no reply</span>
              </div>
              <label className="block">
                <span className="mb-1.5 block text-[14px] text-[var(--color-text-dim)]">Subject</span>
                <input
                  className="field"
                  value={fu.subject}
                  maxLength={200}
                  placeholder={`Re: ${p.subject || "your first subject"}`}
                  onChange={(e) => p.onFollowUp({ ...fu, subject: e.target.value })}
                />
                <span className="mt-1 block text-[14px] text-[var(--color-text-dim)]">Leave it empty to reply in the same thread.</span>
              </label>
              <div>
                <div className="mb-1.5 flex items-end justify-between gap-3">
                  <label htmlFor="fu-body" className="text-[14px] text-[var(--color-text-dim)]">
                    Message
                  </label>
                  <FieldMenu extraFields={p.extraFields} onInsert={(t) => p.onFollowUp({ ...fu, body: fu.body + t })} />
                </div>
                <textarea
                  id="fu-body"
                  className="field min-h-[150px] text-[16px] leading-relaxed"
                  placeholder={"Hi {{first_name|there}}, just bringing this back to the top of your inbox."}
                  value={fu.body}
                  onChange={(e) => p.onFollowUp({ ...fu, body: e.target.value })}
                />
              </div>
            </div>
          )}
        </section>

        <section aria-labelledby="name" className="card p-4 sm:p-6">
          <label htmlFor="campaign-name" id="name" className="block text-[17px] font-semibold text-[var(--color-text)]">
            Name it
          </label>
          <p className="mt-1 text-[15px] text-[var(--color-text-muted)]">Only your team sees this, on the Campaigns page.</p>
          <input id="campaign-name" className="field mt-3" value={p.name} maxLength={120} placeholder={p.subject || "October intro, Nashville"} onChange={(e) => p.onName(e.target.value)} />
        </section>
      </div>
    </div>
  );
}
