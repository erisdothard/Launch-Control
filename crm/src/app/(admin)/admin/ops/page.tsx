import Link from "next/link";
import { notFound } from "next/navigation";
import AdminHeader from "@/components/admin/AdminHeader";
import { LiveryRail } from "@/components/today/shared";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server";
import { isOwner } from "@/lib/auth/owner";
import { getOps, type AgentState, type CheckState, type OpsAgent, type OpsCheck, type OpsEvent } from "@/lib/store/ops";

// Agent Ops: is everything running, what each agent is doing, and what they just did.
// Owner-only until it has proven itself; the story video lives under "How it works".

// Private bucket; the page hands out a short-lived signed URL only after the owner check.
const BUCKET = "ops-private";
const VIDEO = "agent-story-v1.mp4";
const POSTER = "agent-story-v1.jpg";
const SIGNED_SECONDS = 60 * 60;

const CHECK_DOT: Record<CheckState, string> = {
  ok: "var(--color-success)",
  down: "var(--color-hot)",
  waiting: "var(--color-warm)",
  info: "var(--color-text-dim)",
};

const CHECK_WORD: Record<CheckState, string> = { ok: "OK", down: "Needs you", waiting: "Waiting", info: "Setting" };

const AGENT_TONE: Record<AgentState, string> = {
  working: "text-[var(--color-success)]",
  blocked: "text-[var(--color-hot)]",
  idle: "text-[var(--color-text-dim)]",
  learning: "text-[var(--color-text-dim)]",
};

async function signedUrl(path: string): Promise<string | null> {
  const db = createServiceRoleClient();
  if (!db) return null;
  const { data, error } = await db.storage.from(BUCKET).createSignedUrl(path, SIGNED_SECONDS);
  if (error) return null;
  return data.signedUrl;
}

function CheckRow({ check }: { check: OpsCheck }) {
  return (
    <li className="flex flex-col gap-2 border-t border-[var(--color-border)] py-4 first:border-t-0 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:gap-5">
      <div className="flex min-w-0 flex-1 items-start gap-3.5">
        <span aria-hidden="true" className="mt-[7px] h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: CHECK_DOT[check.state] }} />
        <div className="min-w-0">
          <p className="text-[16px] font-semibold text-[var(--color-text)]">
            {check.label}
            <span className="sr-only">: {CHECK_WORD[check.state]}</span>
          </p>
          <p className="text-[15px] text-[var(--color-text-muted)]">{check.detail}</p>
        </div>
      </div>
      {check.href && check.action && (
        <Link href={check.href} className={`btn btn-sm shrink-0 self-start sm:self-center ${check.state === "down" ? "btn-primary" : "btn-secondary"}`}>
          {check.action}
        </Link>
      )}
    </li>
  );
}

function AgentRow({ agent }: { agent: OpsAgent }) {
  return (
    <li className="grid grid-cols-[44px_minmax(0,1fr)] gap-x-4 gap-y-3 border-t border-[var(--color-border)] px-5 py-5 first:border-t-0 sm:px-6 lg:grid-cols-[44px_220px_minmax(0,1fr)_auto] lg:items-center">
      <p className="font-display pt-0.5 text-[13px] tracking-[var(--tracking-signage)] text-[var(--color-accent)]">{agent.tag}</p>
      <div className="min-w-0">
        <p className="text-[16px] font-semibold text-[var(--color-text)]">{agent.name}</p>
        <p className="text-[14px] text-[var(--color-text-dim)]">{agent.seat}</p>
        <p className={`mt-1 text-[14px] font-medium ${AGENT_TONE[agent.state]}`}>{agent.stateLabel}</p>
      </div>
      <div className="col-start-2 min-w-0 lg:col-start-auto">
        <p className="text-[16px] text-[var(--color-text)]">{agent.headline}</p>
        <p className="text-[15px] text-[var(--color-text-muted)]">{agent.detail}</p>
      </div>
      {agent.href && agent.action && (
        <Link href={agent.href} className="btn btn-secondary btn-sm col-start-2 justify-self-start lg:col-start-auto lg:justify-self-end">
          {agent.action}
        </Link>
      )}
    </li>
  );
}

function Feed({ events }: { events: OpsEvent[] }) {
  return (
    <section aria-labelledby="ops-feed">
      <h2 id="ops-feed" className="mb-3 text-[17px] font-semibold text-[var(--color-text)]">
        Latest
      </h2>
      {events.length === 0 ? (
        <p className="border-t border-[var(--color-border)] py-3.5 text-[15px] text-[var(--color-text-dim)]">Nothing in the last two weeks.</p>
      ) : (
        <ol>
          {events.map((e) => (
            <li key={e.id} className="border-t border-[var(--color-border)] py-3">
              <p className="text-[14px] text-[var(--color-text-dim)]">
                <span className="text-[var(--color-text-muted)]">{e.agent}</span> · {e.when}
              </p>
              <p className="text-[15px] text-[var(--color-text)]">{e.text}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export default async function OpsPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!isOwner(user?.email)) notFound();

  const [ops, video, poster] = await Promise.all([getOps(), signedUrl(VIDEO), signedUrl(POSTER)]);
  const problems = ops.checks.some((c) => c.state === "down");

  return (
    <div className="max-w-[1204px]">
      <AdminHeader title="Agent Ops" subtitle={ops.lede} />

      <div className="grid grid-cols-1 gap-x-11 gap-y-12 min-[1100px]:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-w-0 flex-col gap-10">
          <section aria-labelledby="ops-status" className="card relative overflow-hidden px-6 py-6 sm:px-8">
            {problems && <LiveryRail />}
            <h2 id="ops-status" className="mb-4 text-[17px] font-semibold text-[var(--color-text)]">
              {problems ? "Needs you" : "All systems"}
            </h2>
            <ul>
              {ops.checks.map((c) => (
                <CheckRow key={c.key} check={c} />
              ))}
            </ul>
          </section>

          <section aria-labelledby="ops-agents">
            <h2 id="ops-agents" className="mb-3 text-[17px] font-semibold text-[var(--color-text)]">
              The agents
            </h2>
            <ol className="card overflow-hidden">
              {ops.agents.map((a) => (
                <AgentRow key={a.tag} agent={a} />
              ))}
            </ol>
          </section>

          <details className="card group overflow-hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between px-6 py-5 text-[16px] font-semibold text-[var(--color-text)] hover:bg-[var(--color-bg-hover)] sm:px-8">
              How it works
              <span className="text-[14px] font-normal text-[var(--color-text-dim)] group-open:hidden">23-second video</span>
            </summary>
            {video ? (
              <video src={video} poster={poster ?? undefined} controls playsInline preload="none" className="block aspect-video w-full bg-black" />
            ) : (
              <p className="px-6 pb-6 text-[15px] text-[var(--color-text-muted)] sm:px-8">The video shows up here as soon as it&apos;s uploaded.</p>
            )}
          </details>
        </div>

        <aside aria-label="What the agents just did" className="min-w-0 min-[1100px]:pt-1">
          <Feed events={ops.feed} />
        </aside>
      </div>
    </div>
  );
}
