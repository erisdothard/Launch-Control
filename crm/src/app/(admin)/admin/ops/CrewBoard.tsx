import { LiveryRail } from "@/components/today/shared";
import { CREW, keyNumbers, type AgentRun, type CrewKey, type HaltFlag } from "@/lib/agents/crew";
import { USABLE_TARGET, type PipelineSnapshot } from "@/lib/agents/metrics";
import { clearHalt } from "./actions";

// The Crew board: what the five agents last logged to agent_runs, the Mission Control brief, the
// pipeline numbers (lib/agents/metrics.ts, twin of tools/leadgen/leadgen/metrics.py) and the
// Guardian's halt. Server-rendered from live rows; every empty state says what hasn't happened.

export interface CrewData {
  runs: Record<CrewKey, AgentRun | null | undefined>;
  halt: HaltFlag;
  pipeline: PipelineSnapshot | null;
  when: (iso: string) => string;
  notice: string | null;
}

const STATUS: Record<AgentRun["status"], { word: string; color: string }> = {
  done: { word: "Done", color: "var(--color-success)" },
  running: { word: "Running", color: "var(--color-warm)" },
  halted: { word: "Halted outbound", color: "var(--color-hot)" },
  failed: { word: "Failed", color: "var(--color-hot)" },
};

function HaltPanel({ halt, when, notice }: { halt: HaltFlag; when: CrewData["when"]; notice: string | null }) {
  const stopped = halt.halted !== false;
  const by = halt.updatedBy ? ` by ${halt.updatedBy}` : "";
  const at = halt.updatedAt ? `, ${when(halt.updatedAt)}` : "";
  return (
    <section aria-labelledby="ops-halt" className="card relative overflow-hidden px-6 py-5 sm:px-8">
      {stopped && <LiveryRail />}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3.5">
          <span
            aria-hidden="true"
            className="mt-[7px] h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ background: stopped ? "var(--color-hot)" : "var(--color-success)" }}
          />
          <div className="min-w-0">
            <h2 id="ops-halt" className="text-[17px] font-semibold text-[var(--color-text)]">
              {halt.halted === null ? "Outbound status unknown" : stopped ? "Outbound is halted" : "Outbound is clear"}
            </h2>
            <p className="text-[15px] text-[var(--color-text-muted)]">
              {halt.halted === null
                ? "The halt flag couldn't be read, so every send is refused until it can."
                : stopped
                  ? `Guardian stopped every send${by}${at}. Nothing leaves until a person clears it.`
                  : halt.updatedBy
                    ? `Last cleared${by}${at}.`
                    : "Guardian hasn't halted anything."}
            </p>
            {notice && <p className="mt-1 text-[14px] text-[var(--color-warm)]">{notice}</p>}
          </div>
        </div>
        {halt.halted === true && (
          <form action={clearHalt} className="shrink-0">
            <button type="submit" className="btn btn-primary btn-sm">
              Clear halt
            </button>
          </form>
        )}
      </div>
    </section>
  );
}

function Brief({ run, when }: { run: AgentRun | null | undefined; when: CrewData["when"] }) {
  return (
    <section aria-labelledby="ops-brief" className="card px-6 py-6 sm:px-8">
      <p className="font-display mb-2 text-[11px] tracking-[var(--tracking-signage)] text-[var(--color-accent)] uppercase">Mission Control</p>
      <h2 id="ops-brief" className="mb-3 text-[20px] font-semibold text-[var(--color-text)]">
        The brief
      </h2>
      {run === undefined ? (
        <p className="text-[15px] text-[var(--color-text-muted)]">Couldn&apos;t read the crew&apos;s log.</p>
      ) : !run ? (
        <p className="text-[15px] text-[var(--color-text-muted)]">Mission Control hasn&apos;t written a brief yet.</p>
      ) : run.status === "failed" || !run.decision.trim() ? (
        <p className="text-[15px] text-[var(--color-text-muted)]">
          The last pass ({when(run.startedAt)}) {run.status === "failed" ? `failed: ${run.error ?? "no reason logged"}` : "logged no brief"}.
        </p>
      ) : (
        <>
          <p className="text-[17px] leading-relaxed whitespace-pre-line text-[var(--color-text)]">{run.decision}</p>
          <p className="mt-3 text-[14px] text-[var(--color-text-dim)]">Written {when(run.startedAt)}</p>
        </>
      )}
    </section>
  );
}

function Pipeline({ p }: { p: PipelineSnapshot | null }) {
  if (!p) {
    return (
      <section aria-labelledby="ops-pipeline" className="card px-6 py-5 sm:px-8">
        <h2 id="ops-pipeline" className="mb-1 text-[17px] font-semibold text-[var(--color-text)]">
          Pipeline
        </h2>
        <p className="text-[15px] text-[var(--color-text-muted)]">Couldn&apos;t read the pipeline numbers.</p>
      </section>
    );
  }
  const rateLow = p.kept > p.callList && p.usableRate < USABLE_TARGET;
  const cells: { label: string; value: string; note?: string; warn?: boolean }[] = [
    { label: "Scanned", value: p.scanned.toLocaleString("en-US") },
    { label: "Kept", value: p.kept.toLocaleString("en-US") },
    { label: "Good fit", value: p.usable.toLocaleString("en-US"), note: `${Math.round(p.usableRate * 100)}% usable`, warn: rateLow },
    { label: "Call list", value: p.callList.toLocaleString("en-US") },
    { label: "Drafts waiting", value: p.draftsPending.toLocaleString("en-US") },
    { label: "Sent", value: p.sent.toLocaleString("en-US"), note: `${p.contacted} contacted` },
    { label: "Replies", value: p.replies.toLocaleString("en-US"), note: `${p.repliedLeads} prospects` },
    { label: "Meetings", value: p.meetings.toLocaleString("en-US") },
    { label: "Won", value: p.won.toLocaleString("en-US") },
  ];
  return (
    <section aria-labelledby="ops-pipeline">
      <h2 id="ops-pipeline" className="mb-1 text-[17px] font-semibold text-[var(--color-text)]">
        Pipeline
      </h2>
      <p className="mb-3 text-[14px] text-[var(--color-text-dim)]">
        Prospects from lead-gen only. Good fit = site read, email found, score 55+. Replies leave out auto-replies.
      </p>
      <ol className="card grid grid-cols-2 gap-px overflow-hidden bg-[var(--color-border)] sm:grid-cols-3 lg:grid-cols-9">
        {cells.map((c) => (
          <li key={c.label} className="bg-[var(--color-bg-card)] px-4 py-4">
            <p className="text-[13px] text-[var(--color-text-dim)]">{c.label}</p>
            <p className="font-display mt-1 text-[22px] text-[var(--color-text)] tabular-nums">{c.value}</p>
            {c.note && <p className={`text-[13px] ${c.warn ? "text-[var(--color-warm)]" : "text-[var(--color-text-muted)]"}`}>{c.note}</p>}
          </li>
        ))}
      </ol>
    </section>
  );
}

function CrewRow({ agent, run, when }: { agent: (typeof CREW)[number]; run: AgentRun | null | undefined; when: CrewData["when"] }) {
  const status = run ? STATUS[run.status] : null;
  const numbers = run ? keyNumbers(run.evidence) : [];
  const decision = agent.key === "mission-control" && run?.decision ? "Wrote the brief above." : run?.decision;
  return (
    <li className="grid grid-cols-1 gap-x-6 gap-y-2 border-t border-[var(--color-border)] px-5 py-5 first:border-t-0 sm:px-6 lg:grid-cols-[220px_minmax(0,1fr)]">
      <div className="min-w-0">
        <p className="text-[16px] font-semibold text-[var(--color-text)]">{agent.name}</p>
        <p className="text-[14px] text-[var(--color-text-dim)]">{agent.job}</p>
        {status && run && (
          <p className="mt-1 flex items-center gap-2 text-[14px] font-medium" style={{ color: status.color }}>
            <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: status.color }} />
            {status.word}
            <span className="font-normal text-[var(--color-text-dim)]">· {when(run.startedAt)}</span>
          </p>
        )}
      </div>
      <div className="min-w-0">
        {run === undefined ? (
          <p className="text-[15px] text-[var(--color-text-muted)]">Couldn&apos;t read this agent&apos;s log.</p>
        ) : !run ? (
          <p className="text-[15px] text-[var(--color-text-muted)]">{agent.name} hasn&apos;t run yet.</p>
        ) : (
          <>
            <p className="text-[15px] break-words text-[var(--color-text)]">{decision || "No decision logged."}</p>
            {run.status === "failed" && run.error && <p className="mt-1 text-[14px] break-words text-[var(--color-hot)]">{run.error}</p>}
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
          </>
        )}
      </div>
    </li>
  );
}

export default function CrewBoard({ runs, halt, pipeline, when, notice }: CrewData) {
  return (
    <div className="flex min-w-0 flex-col gap-10">
      <HaltPanel halt={halt} when={when} notice={notice} />
      <Brief run={runs["mission-control"]} when={when} />
      <Pipeline p={pipeline} />
      <section aria-labelledby="ops-crew">
        <h2 id="ops-crew" className="mb-3 text-[17px] font-semibold text-[var(--color-text)]">
          Crew
        </h2>
        <ol className="card overflow-hidden">
          {CREW.map((a) => (
            <CrewRow key={a.key} agent={a} run={runs[a.key]} when={when} />
          ))}
        </ol>
      </section>
    </div>
  );
}
