import Link from "next/link";
import { LiveryRail } from "@/components/today/shared";
import { CREW, keyNumbers, type AgentRun, type CrewKey, type HaltFlag } from "@/lib/agents/crew";
import { USABLE_TARGET, type PipelineSnapshot } from "@/lib/agents/metrics";
import type { AgentState, OpsAgent, OpsCheck } from "@/lib/store/ops";
import { clearHalt } from "./actions";

// The Ops board, read top to bottom: what needs you, the brief, how the pipeline is doing, then one
// line per agent. Two sources meet here: agent_runs (what each agent last logged) and the CRM-side
// view in lib/store/ops.ts (plain sentences from CRM activity). Each agent shows once, with the
// sentence a person can read and the run's status beside it.

type When = (iso: string) => string;

const DOT = {
  good: "var(--color-success)",
  busy: "var(--color-warm)",
  bad: "var(--color-hot)",
  quiet: "var(--color-text-dim)",
} as const;

const RUN_STATUS: Record<AgentRun["status"], { word: string; dot: string }> = {
  done: { word: "Done", dot: DOT.good },
  running: { word: "Running", dot: DOT.busy },
  halted: { word: "Halted sending", dot: DOT.bad },
  failed: { word: "Failed", dot: DOT.bad },
};

const SEAT_DOT: Record<AgentState, string> = { working: DOT.good, blocked: DOT.bad, idle: DOT.quiet, learning: DOT.quiet };

function Dot({ color }: { color: string }) {
  return <span aria-hidden="true" className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />;
}

/* ---------- Right now: everything that needs a person, then the all-clear line ---------- */

export interface Waiting {
  label: string;
  count: number;
  href: string;
  action: string;
}

export function RightNow({ halt, checks, waiting, when, notice }: { halt: HaltFlag; checks: OpsCheck[]; waiting: Waiting[]; when: When; notice: string | null }) {
  const stopped = halt.halted !== false;
  const stoppedBy = [halt.updatedBy, halt.updatedAt && when(halt.updatedAt)].filter(Boolean).join(", ");
  const broken = checks.filter((c) => c.state === "down" || c.state === "waiting");
  const fine = checks.filter((c) => c.state === "ok");
  const sending = checks.find((c) => c.key === "sending");
  const due = waiting.filter((w) => w.count > 0);
  const alarm = stopped || broken.some((c) => c.state === "down");
  const nothing = !stopped && broken.length === 0 && due.length === 0;

  return (
    <section aria-labelledby="ops-now" className="card relative overflow-hidden">
      {alarm && <LiveryRail />}
      <div className="px-6 pt-6 pb-5 sm:px-8">
        <h2 id="ops-now" className="text-[20px] font-semibold text-[var(--color-text)]">
          {alarm ? "Something needs fixing" : nothing ? "Nothing needs you" : "Waiting on you"}
        </h2>
        {notice && <p className="mt-1 text-[15px] text-[var(--color-warm)]">{notice}</p>}

        {stopped && (
          <div className="well mt-4 flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-start gap-3 text-[15px] text-[var(--color-text)]">
              <span className="mt-[6px]">
                <Dot color={DOT.bad} />
              </span>
              {halt.halted === null
                ? "Sending is stopped: the halt switch couldn't be read, so nothing goes out until it can."
                : `Guardian stopped all sending${stoppedBy ? ` (${stoppedBy})` : ""}. Nothing goes out until you clear it.`}
            </p>
            {halt.halted === true && (
              <form action={clearHalt} className="shrink-0">
                <button type="submit" className="btn btn-primary btn-sm">
                  Clear halt
                </button>
              </form>
            )}
          </div>
        )}

        {broken.map((c) => (
          <div key={c.key} className="well mt-3 flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-start gap-3 text-[15px]">
              <span className="mt-[6px]">
                <Dot color={c.state === "down" ? DOT.bad : DOT.busy} />
              </span>
              <span>
                <span className="font-semibold text-[var(--color-text)]">{c.label}.</span> <span className="text-[var(--color-text-muted)]">{c.detail}</span>
              </span>
            </p>
            {c.href && c.action && (
              <Link href={c.href} className="btn btn-secondary btn-sm shrink-0 self-start sm:self-center">
                {c.action}
              </Link>
            )}
          </div>
        ))}

        {due.length > 0 && (
          <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {due.map((w, i) => (
              <li key={w.label}>
                <Link
                  href={w.href}
                  className="group flex h-full items-center justify-between gap-4 rounded-[var(--radius-md)] bg-[var(--color-bg-secondary)] px-5 py-4 transition-colors hover:bg-[var(--color-bg-hover)] hover:shadow-[inset_0_0_0_1px_var(--color-border-bright)]"
                >
                  <span className="min-w-0">
                    <span className={`font-display block text-[28px] leading-none tabular-nums ${i === 0 ? "text-[var(--color-accent)]" : "text-[var(--color-text)]"}`}>{w.count}</span>
                    <span className="mt-2 block text-[15px] text-[var(--color-text-muted)]">{w.label}</span>
                  </span>
                  <span className="shrink-0 text-[14px] text-[var(--color-text)] transition-transform group-hover:translate-x-0.5">{w.action} →</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* The all-clear line: every system that's fine, one dot each. */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-[var(--color-border)] px-6 py-4 text-[14px] text-[var(--color-text-muted)] sm:px-8">
        {!stopped && (
          <span className="flex items-center gap-2">
            <Dot color={DOT.good} /> Sending is clear
          </span>
        )}
        {fine.map((c) => (
          <span key={c.key} className="flex items-center gap-2">
            <Dot color={DOT.good} />
            <span>
              <span className="text-[var(--color-text)]">{c.label}</span> · {c.detail}
            </span>
          </span>
        ))}
        {sending && (
          <Link href={sending.href ?? "/admin/settings?tab=autopilot"} className="flex items-center gap-2 hover:text-[var(--color-text)]">
            <Dot color={DOT.quiet} />
            Automatic sending {sending.detail.startsWith("On") ? "on" : "off"}
            <span className="underline underline-offset-2">change</span>
          </Link>
        )}
      </div>
    </section>
  );
}

/* ---------- The brief ---------- */

export function Brief({ run, when }: { run: AgentRun | null | undefined; when: When }) {
  const status = run ? RUN_STATUS[run.status] : null;
  return (
    <section aria-labelledby="ops-brief" className="card px-6 py-6 sm:px-8">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="ops-brief" className="text-[20px] font-semibold text-[var(--color-text)]">
          Today&apos;s brief
        </h2>
        {run && status && (
          <p className="flex items-center gap-2 text-[14px] text-[var(--color-text-dim)]">
            <Dot color={status.dot} /> Mission Control · {when(run.startedAt)}
          </p>
        )}
      </div>
      {run === undefined ? (
        <p className="text-[15px] text-[var(--color-text-muted)]">Couldn&apos;t read the crew&apos;s log.</p>
      ) : !run ? (
        <p className="text-[15px] text-[var(--color-text-muted)]">Mission Control hasn&apos;t written a brief yet.</p>
      ) : run.status === "failed" || !run.decision.trim() ? (
        <p className="text-[15px] text-[var(--color-text-muted)]">
          The last pass {run.status === "failed" ? `failed: ${run.error ?? "no reason logged"}` : "logged no brief"}.
        </p>
      ) : (
        <BriefBody text={run.decision} />
      )}
    </section>
  );
}

/**
 * Mission Control writes "Label: text" paragraphs (tools/leadgen/leadgen/mission_control.py). The
 * Totals paragraph repeats the funnel below, so it's left out; the Decision leads; each agent's note
 * follows on its own line. Anything that doesn't fit that shape shows as written.
 */
function BriefBody({ text }: { text: string }) {
  const parts = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const m = p.match(/^([A-Za-z][\w -]{1,24}):\s+([\s\S]+)$/);
      return m ? { label: m[1], body: m[2] } : { label: "", body: p };
    });
  const decision = parts.find((p) => p.label.toLowerCase() === "decision");
  const notes = parts.filter((p) => p !== decision && p.label.toLowerCase() !== "totals");
  if (!decision) return <p className="text-[16px] leading-relaxed whitespace-pre-line text-[var(--color-text)]">{text}</p>;
  const name = (label: string) => label.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return (
    <>
      <p className="text-[18px] leading-relaxed font-medium text-[var(--color-text)]">{decision.body.replace(/\b(\d+)([^()\d]*?)\(s\)/g, (_, n: string, words: string) => `${n}${words}${n === "1" ? "" : "s"}`)}</p>
      {notes.length > 0 && (
        <ul className="mt-4 space-y-2 border-t border-[var(--color-border)] pt-4">
          {notes.map((n) => (
            <li key={n.label + n.body} className="text-[15px] leading-relaxed text-[var(--color-text-muted)]">
              {n.label && <span className="font-semibold text-[var(--color-text)]">{name(n.label)}: </span>}
              {n.body}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/* ---------- Pipeline as a funnel ---------- */

export function Funnel({ p }: { p: PipelineSnapshot | null }) {
  if (!p) {
    return (
      <section aria-labelledby="ops-pipeline" className="card px-6 py-5 sm:px-8">
        <h2 id="ops-pipeline" className="text-[20px] font-semibold text-[var(--color-text)]">
          Pipeline
        </h2>
        <p className="mt-1 text-[15px] text-[var(--color-text-muted)]">Couldn&apos;t read the pipeline numbers.</p>
      </section>
    );
  }
  const rateLow = p.kept > p.callList && p.usableRate < USABLE_TARGET;
  const steps: { label: string; value: number; note?: string; warn?: boolean }[] = [
    { label: "Businesses found", value: p.scanned },
    { label: "Good fit", value: p.usable, note: `${Math.round(p.usableRate * 100)}% of the ones kept`, warn: rateLow },
    { label: "Emailed", value: p.contacted, note: p.sent !== p.contacted ? `${p.sent} emails` : undefined },
    { label: "Wrote back", value: p.repliedLeads },
    { label: "Meetings", value: p.meetings },
    { label: "Won", value: p.won },
  ];
  const top = Math.max(1, p.scanned);
  return (
    <section aria-labelledby="ops-pipeline" className="card px-6 py-6 sm:px-8">
      <h2 id="ops-pipeline" className="text-[20px] font-semibold text-[var(--color-text)]">
        Pipeline
      </h2>
      <p className="mt-1 text-[14px] text-[var(--color-text-dim)]">Businesses the Prospector found, and how far each got. Auto-replies don&apos;t count.</p>
      <ol className="mt-5 space-y-3">
        {steps.map((s, i) => (
          <li key={s.label} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_3.5rem] items-center gap-4 sm:grid-cols-[11rem_minmax(0,1fr)_4rem]">
            <span className="min-w-0">
              <span className="block truncate text-[15px] text-[var(--color-text)]">{s.label}</span>
              {s.note && <span className={`block truncate text-[13px] ${s.warn ? "text-[var(--color-warm)]" : "text-[var(--color-text-dim)]"}`}>{s.note}</span>}
            </span>
            <span className="h-3 overflow-hidden rounded-full bg-[var(--color-bg-secondary)]" aria-hidden="true">
              <span
                className="block h-full rounded-full"
                style={{
                  // Square-root scale so the small late steps still show next to hundreds found.
                  width: s.value > 0 ? `${Math.max(3, Math.sqrt(s.value / top) * 100)}%` : "0%",
                  background: i === steps.length - 1 ? "var(--color-success)" : i >= 3 ? "var(--color-accent)" : "var(--color-steel)",
                }}
              />
            </span>
            <span className="font-display text-right text-[18px] text-[var(--color-text)] tabular-nums">{s.value.toLocaleString("en-US")}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ---------- The crew: one row per agent ---------- */

// agent_runs keys to the CRM-side seats in lib/store/ops.ts (matched by name there).
const SEAT_NAME: Partial<Record<CrewKey, string>> = {
  guardian: "Guardian",
  prospector: "The Prospector",
  "outreach-writer": "The Outreach Writer",
  strategist: "The Strategist",
};

export function Crew({ runs, seats, when }: { runs: Record<CrewKey, AgentRun | null | undefined>; seats: OpsAgent[]; when: When }) {
  const rows = CREW.filter((a) => a.key !== "mission-control");
  return (
    <section aria-labelledby="ops-crew">
      <h2 id="ops-crew" className="mb-3 text-[20px] font-semibold text-[var(--color-text)]">
        The crew
      </h2>
      <ol className="card overflow-hidden">
        {rows.map((agent) => {
          const run = runs[agent.key];
          const seat = seats.find((s) => s.name === SEAT_NAME[agent.key]);
          const status = run ? RUN_STATUS[run.status] : null;
          // The seat's sentence comes from CRM activity and reads as English; the run's decision is
          // the fallback when there's no seat for this agent.
          const headline = seat?.headline ?? (run?.decision || `${agent.name} hasn't run yet.`);
          const detail = seat?.detail ?? "";
          // What the agent itself logged on its last pass, shown under the CRM sentence.
          const decision = seat && run?.decision?.trim() && run.decision !== headline ? run.decision : "";
          const numbers = run ? keyNumbers(run.evidence) : [];
          return (
            <li
              key={agent.key}
              className="grid grid-cols-1 gap-x-6 gap-y-2 border-t border-[var(--color-border)] px-5 py-5 first:border-t-0 sm:px-6 lg:grid-cols-[200px_minmax(0,1fr)_auto] lg:items-center"
            >
              <div className="min-w-0">
                <p className="text-[17px] font-semibold text-[var(--color-text)]">{agent.name}</p>
                <p className="text-[14px] text-[var(--color-text-dim)]">{agent.job}</p>
                <p className="mt-1.5 flex items-center gap-2 text-[14px] text-[var(--color-text-muted)]">
                  {status && run ? (
                    <>
                      <Dot color={status.dot} />
                      {status.word} · {when(run.startedAt)}
                    </>
                  ) : seat ? (
                    <>
                      <Dot color={SEAT_DOT[seat.state]} />
                      {seat.stateLabel}
                    </>
                  ) : (
                    <>
                      <Dot color={DOT.quiet} />
                      Not run yet
                    </>
                  )}
                </p>
                {run && seat && <p className="mt-0.5 pl-[18px] text-[14px] text-[var(--color-text-dim)]">{seat.stateLabel}</p>}
              </div>
              <div className="min-w-0">
                <p className="text-[16px] text-[var(--color-text)]">{headline}</p>
                {detail && <p className="text-[15px] text-[var(--color-text-muted)]">{detail}</p>}
                {decision && (
                  <p className="mt-2 text-[15px] break-words text-[var(--color-text-muted)]">
                    <span className="font-semibold text-[var(--color-text)]">Last pass: </span>
                    {decision}
                  </p>
                )}
                {numbers.length > 0 && (
                  <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
                    {numbers.map((n) => (
                      <div key={n.label} className="flex gap-1.5 text-[14px]">
                        <dt className="text-[var(--color-text-dim)]">{n.label}</dt>
                        <dd className="text-[var(--color-text-muted)] tabular-nums">{n.value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {run?.status === "failed" && run.error && <p className="mt-1 text-[14px] break-words text-[var(--color-hot)]">{run.error}</p>}
              </div>
              {seat?.href && seat.action && (
                <Link href={seat.href} className="btn btn-secondary btn-sm justify-self-start lg:justify-self-end">
                  {seat.action}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
