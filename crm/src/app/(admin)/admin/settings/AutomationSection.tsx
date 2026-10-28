"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { AfterLastFollowUp, AutomationSettings, AutopilotPulse } from "@/lib/store/drafts";
import { updateAutomationAction } from "../drafts/actions";

// The worker spaces follow-ups three business days apart; only how many there are is a setting.
const FOLLOW_UP_GAP = "3 business days";
const MAX_FOLLOW_UPS = 6;

const OUTCOMES: { id: AfterLastFollowUp; label: string; node: string; hint: string }[] = [
  { id: "nurture", label: "Gone quiet", node: "Gone quiet", hint: "Off your daily list, not lost. They come back the moment they write." },
  { id: "lost", label: "Close as lost", node: "Lost", hint: "Closed as lost. If they write later, they come back as replied." },
  { id: "none", label: "I'll decide", node: "Your call", hint: "Nothing moves. They stay where they are until you decide." },
];

function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (next: boolean) => void; label: string; disabled: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-9 w-[64px] shrink-0 rounded-full transition-colors duration-150 disabled:opacity-50 ${
        checked ? "bg-[var(--color-success)]" : "bg-[var(--color-bg-secondary)] shadow-[inset_0_0_0_1px_var(--color-border-bright)]"
      }`}
    >
      <span
        className={`absolute top-1 left-1 h-7 w-7 rounded-full transition-transform duration-300 ease-[var(--ease-out-expo)] ${checked ? "translate-x-7 bg-[var(--color-on-accent)]" : "bg-[var(--color-steel)]"}`}
      />
    </button>
  );
}

function SwitchCard({
  title,
  on,
  off,
  checked,
  onChange,
  disabled,
  icon,
  footer,
}: {
  title: string;
  on: string;
  off: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled: boolean;
  icon: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div
      className={`card flex flex-col gap-5 p-5 transition-shadow duration-200 sm:p-6 ${checked ? "shadow-[inset_0_0_0_1px_rgba(143,220,154,0.35)]" : ""}`}
    >
      <div className="flex items-start justify-between gap-4">
        <span className={`flex h-11 w-11 items-center justify-center rounded-full ${checked ? "bg-[rgba(143,220,154,0.12)] text-[var(--color-success)]" : "bg-[var(--color-bg-secondary)] text-[var(--color-text-dim)]"}`}>
          {icon}
        </span>
        <Switch checked={checked} onChange={onChange} label={title} disabled={disabled} />
      </div>
      <div>
        <p className="flex items-baseline gap-3">
          <span className="text-[19px] font-semibold text-[var(--color-text)]">{title}</span>
          <span className={`font-[family-name:var(--font-display)] text-[10px] tracking-[var(--tracking-signage)] ${checked ? "text-[var(--color-success)]" : "text-[var(--color-text-dim)]"}`}>
            {checked ? "ON" : "OFF"}
          </span>
        </p>
        <p className="mt-1.5 text-[15px] leading-relaxed text-[var(--color-text-muted)]">{checked ? on : off}</p>
      </div>
      {footer}
    </div>
  );
}

function Stepper({
  value,
  min,
  max,
  step = 1,
  onChange,
  label,
  unit,
  className = "",
}: {
  className?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (next: number) => void;
  label: string;
  unit?: string;
}) {
  const btn =
    "flex h-11 w-11 items-center justify-center rounded-[var(--radius-sm)] text-[22px] leading-none text-[var(--color-text)] transition-colors hover:bg-[var(--color-bg-hover)] disabled:opacity-30 disabled:hover:bg-transparent";
  return (
    <div className={`inline-flex items-center gap-1 rounded-[var(--radius-md)] bg-[var(--color-bg-secondary)] p-1 ${className}`} role="group" aria-label={label}>
      <button type="button" className={btn} onClick={() => onChange(Math.max(min, value - step))} disabled={value <= min} aria-label={`Fewer: ${label}`}>
        −
      </button>
      <output aria-live="polite" className="min-w-[3.5rem] text-center">
        <span className="tabular text-[20px] font-semibold text-[var(--color-text)]">{value}</span>
        {unit && <span className="ml-1 text-sm text-[var(--color-text-dim)]">{unit}</span>}
      </output>
      <button type="button" className={btn} onClick={() => onChange(Math.min(max, value + step))} disabled={value >= max} aria-label={`More: ${label}`}>
        +
      </button>
    </div>
  );
}

/** First email, each follow-up, the wait, then where the lead ends up. Stops the moment they reply. */
function FollowUpTrack({ count, wait, outcome, pulse }: { count: number; wait: number; outcome: AfterLastFollowUp; pulse: AutopilotPulse }) {
  const end = OUTCOMES.find((o) => o.id === outcome)!;
  // Leads sitting at each stop now. Past the last follow-up they wait at it for the outcome.
  const here = Array.from({ length: count + 1 }, (_, i) =>
    i < count ? (pulse.onTrack[i] ?? 0) : pulse.onTrack.slice(count).reduce((sum, n) => sum + n, 0),
  );
  const stops = [
    { name: "First email", gap: null as string | null, kind: "start" as const, leads: here[0] as number | null },
    ...Array.from({ length: count }, (_, i) => ({
      name: `Follow-up ${i + 1}`,
      gap: `+${FOLLOW_UP_GAP.replace(" business", " biz")}`,
      kind: "follow" as const,
      leads: here[i + 1] as number | null,
    })),
    { name: end.node, gap: `+${wait} day${wait === 1 ? "" : "s"}`, kind: "end" as const, leads: outcome === "nurture" ? pulse.goneQuiet : null },
  ];
  return (
    <ol aria-label="What happens when a lead doesn't answer" className="relative flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-0">
      {/* Phone: one rail down the left behind the stops. */}
      <span aria-hidden="true" className="absolute top-5 bottom-5 left-[19px] w-[2px] bg-[var(--color-text-dim)]/40 sm:hidden" />
      {stops.map((s, i) => (
        <li key={`${s.name}-${i}`} className="relative flex items-center gap-4 sm:flex-1 sm:flex-col sm:items-center sm:gap-0 sm:text-center">
          {/* Desktop: connector into this stop, labelled with the wait before it. */}
          {i > 0 && (
            <>
              <span aria-hidden="true" className="absolute top-[19px] right-1/2 left-[-50%] hidden h-[2px] bg-[var(--color-text-dim)]/40 sm:block" />
              <span className="absolute top-[-14px] left-0 hidden w-full -translate-x-1/2 text-center text-[13px] text-[var(--color-text-dim)] tabular sm:block">{s.gap}</span>
            </>
          )}
          <span
            className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-[family-name:var(--font-display)] text-[11px] ${
              s.kind === "start"
                ? "bg-[var(--color-steel)] text-[var(--color-on-accent)]"
                : s.kind === "end"
                  ? "bg-[var(--color-bg-secondary)] text-[var(--color-livery-orange)] shadow-[inset_0_0_0_2px_var(--color-livery-orange)]"
                  : "bg-[var(--color-bg-secondary)] text-[var(--color-steel)] shadow-[inset_0_0_0_2px_var(--color-steel)]"
            }`}
          >
            {s.kind === "start" ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true">
                <path d="m4 12 16-8-6 16-2-6-8-2Z" strokeLinejoin="round" />
              </svg>
            ) : s.kind === "end" ? (
              "■"
            ) : (
              i
            )}
          </span>
          <span className={`text-[15px] sm:mt-3 ${s.kind === "end" ? "font-semibold text-[var(--color-text)]" : "text-[var(--color-text-muted)]"}`}>
            {s.name}
            {s.gap && <span className="ml-2 text-[13px] font-normal text-[var(--color-text-dim)] tabular sm:hidden">{s.gap}</span>}
          </span>
          {s.leads !== null && (
            <span
              className={`ml-auto rounded-full px-2.5 py-0.5 text-[13px] tabular sm:mt-2 sm:ml-0 ${
                s.leads > 0 ? "bg-[var(--color-bg-secondary)] text-[var(--color-text)]" : "text-[var(--color-text-dim)]"
              }`}
            >
              {s.leads} {s.leads === 1 ? "lead" : "leads"}
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}

type SaveState = "idle" | "saving" | "saved" | "error";

export default function AutomationSection({ settings, pulse }: { settings: AutomationSettings; pulse: AutopilotPulse }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [draftReplies, setDraftReplies] = useState(settings.draftReplies);
  const [autoSend, setAutoSend] = useState(settings.autoSendFollowUps);
  const [count, setCount] = useState(settings.followUpDays.length);
  const [wait, setWait] = useState(settings.coldAfterDays);
  const [after, setAfter] = useState<AfterLastFollowUp>(settings.afterLastFollowUp);
  const [cap, setCap] = useState(settings.dailySendCap);

  // Number changes come in bursts (+ + +), so they save once the clicking stops.
  const queued = useRef<Partial<AutomationSettings>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function flush() {
    const patch = queued.current;
    queued.current = {};
    setError(null);
    setSaveState("saving");
    startTransition(async () => {
      const result = await updateAutomationAction(patch);
      if (!result.ok) {
        setError(result.error);
        setSaveState("error");
      } else setSaveState("saved");
      router.refresh();
    });
  }

  function save(patch: Partial<AutomationSettings>, now = false) {
    queued.current = { ...queued.current, ...patch };
    if (timer.current) clearTimeout(timer.current);
    setSaveState("saving");
    timer.current = setTimeout(flush, now ? 0 : 700);
  }

  function changeCount(next: number) {
    setCount(next);
    // Only the length matters to the worker; keep any days already stored and pad with the default gap.
    const days = Array.from({ length: next }, (_, i) => settings.followUpDays[i] ?? 3);
    save({ followUpDays: days });
  }

  const outcome = OUTCOMES.find((o) => o.id === after)!;

  return (
    <section aria-labelledby="automation-heading" className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="automation-heading" className="text-[22px] font-semibold tracking-[-0.02em] text-[var(--color-steel)]">
            What the CRM handles for you
          </h2>
          <p className="mt-1.5 text-base text-[var(--color-text-muted)]">Every change saves on its own.</p>
        </div>
        <p role="status" aria-live="polite" className="h-6 text-sm">
          {saveState === "saving" && <span className="text-[var(--color-text-dim)]">Saving…</span>}
          {saveState === "saved" && <span className="text-[var(--color-success)]">✓ Saved</span>}
          {saveState === "error" && <span className="text-[var(--color-hot)]">{error}</span>}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <SwitchCard
          title="Write my replies"
          on="When a lead writes back, a reply is written and waits for you in Drafts. You read it and send it."
          off="When a lead writes back, you write the reply yourself."
          checked={draftReplies}
          onChange={(v) => {
            setDraftReplies(v);
            save({ draftReplies: v }, true);
          }}
          disabled={false}
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
              <path d="M4 20h4L19 9l-4-4L4 16v4ZM13.5 6.5l4 4" />
            </svg>
          }
        />
        <SwitchCard
          title="Send follow-ups for me"
          on="Follow-ups go out on their own, from the address the thread is on."
          off="Follow-ups are written and wait in Drafts for you to send."
          checked={autoSend}
          onChange={(v) => {
            setAutoSend(v);
            save({ autoSendFollowUps: v }, true);
          }}
          disabled={false}
          footer={
            pulse.draftsWaiting > 0 && (
              <Link href="/admin/drafts" className="mt-auto flex items-center justify-between rounded-[var(--radius-md)] bg-[var(--color-bg-secondary)] px-4 py-3 text-[15px] text-[var(--color-text)] transition-colors hover:bg-[var(--color-bg-hover)]">
                <span>
                  <span className="tabular font-semibold">{pulse.draftsWaiting}</span> {pulse.draftsWaiting === 1 ? "draft is" : "drafts are"} waiting for you
                </span>
                <span aria-hidden="true">→</span>
              </Link>
            )
          }
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
              <path d="m4 12 16-8-6 16-2-6-8-2Z" />
            </svg>
          }
        />
      </div>

      <div className="card p-5 sm:p-8">
        <h3 className="text-[19px] font-semibold text-[var(--color-text)]">When a lead doesn&apos;t answer</h3>
        <p className="mt-1.5 text-[15px] text-[var(--color-text-muted)]">
          The track stops the moment they reply, and anyone who asks to stop is never emailed again. A follow-up date you set on a lead by hand always wins.
        </p>

        <div className="mt-8 sm:mt-10 sm:px-2">
          <FollowUpTrack count={count} wait={wait} outcome={after} pulse={pulse} />
        </div>

        <div className="mt-8 grid grid-cols-1 gap-6 border-t border-[var(--color-border)] pt-6 lg:grid-cols-[auto_auto_1fr] lg:gap-10">
          <div>
            <p className="mb-2 text-sm text-[var(--color-text-dim)]">Follow-ups</p>
            <Stepper value={count} min={1} max={MAX_FOLLOW_UPS} onChange={changeCount} label="Number of follow-ups" />
          </div>
          <div>
            <p className="mb-2 text-sm text-[var(--color-text-dim)]">Then wait</p>
            <Stepper
              value={wait}
              min={1}
              max={60}
              onChange={(v) => {
                setWait(v);
                save({ coldAfterDays: v });
              }}
              label="Days to wait after the last follow-up"
              unit={wait === 1 ? "day" : "days"}
            />
          </div>
          <div>
            <p className="mb-2 text-sm text-[var(--color-text-dim)]">Then</p>
            <div role="radiogroup" aria-label="What happens after the wait" className="grid grid-cols-1 gap-1 rounded-[var(--radius-md)] bg-[var(--color-bg-secondary)] p-1 sm:inline-flex">
              {OUTCOMES.map((o) => {
                const on = o.id === after;
                return (
                  <button
                    key={o.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => {
                      setAfter(o.id);
                      save({ afterLastFollowUp: o.id }, true);
                    }}
                    className={`h-11 rounded-[var(--radius-sm)] px-4 text-left text-[15px] sm:text-center transition-colors duration-150 ${
                      on ? "bg-[var(--color-bg-card)] font-semibold text-[var(--color-text)] shadow-[inset_0_0_0_1px_var(--color-livery-orange)]" : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                    }`}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-sm text-[var(--color-text-muted)]">{outcome.hint}</p>
          </div>
        </div>
      </div>

      <div className="card flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:gap-8 sm:p-8">
        <div className="min-w-0 flex-1">
          <h3 className="text-[19px] font-semibold text-[var(--color-text)]">Daily limit</h3>
          <p className="mt-1.5 text-[15px] text-[var(--color-text-muted)]">The most automatic follow-ups in one day. Keeps the mailbox off spam lists.</p>
          {/* Today's sends against the limit, counted the same way the sender counts them. */}
          <div className="mt-4 max-w-md">
            <div className="h-2 overflow-hidden rounded-full bg-[var(--color-bg-secondary)]" aria-hidden="true">
              <div
                className={`h-full rounded-full ${pulse.sentToday >= cap && cap > 0 ? "bg-[var(--color-livery-orange)]" : "bg-[var(--color-success)]"}`}
                style={{ width: `${cap > 0 ? Math.min(100, (pulse.sentToday / cap) * 100) : 0}%` }}
              />
            </div>
            <p className="mt-2 text-sm text-[var(--color-text-dim)]">
              Today: <span className="tabular text-[var(--color-text)]">{pulse.sentToday}</span> of <span className="tabular">{cap}</span> sent
              {!autoSend && " · automatic sending is off"}
            </p>
          </div>
        </div>
        <Stepper
          value={cap}
          min={0}
          max={200}
          step={5}
          onChange={(v) => {
            setCap(v);
            save({ dailySendCap: v });
          }}
          label="Daily limit"
          unit="a day"
          className="self-start sm:self-center"
        />
      </div>
    </section>
  );
}
