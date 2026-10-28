import { notFound } from "next/navigation";
import AdminHeader from "@/components/admin/AdminHeader";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server";
import { isOwner } from "@/lib/auth/owner";
import { haltFlag, lastRuns } from "@/lib/agents/crew";
import { pipelineSnapshot } from "@/lib/agents/metrics";
import { whenSaid } from "@/lib/store/today";
import { Brief, Crew, Funnel, RightNow } from "./CrewBoard";
import { getOps, type OpsEvent } from "@/lib/store/ops";

// Agent Ops, top to bottom: what needs you right now, today's brief, the pipeline, one line per
// agent, and what they just did. Owner-only until it has proven itself. The Pit Report video stays
// secondary under "Pit Report".
// The worker rebuilds that video from live rows (tools/leadgen/leadgen/pit_report.py) and overwrites
// the "latest" files below.

// Private bucket; the page hands out a short-lived signed URL only after the owner check.
const BUCKET = "ops-private";
const VIDEO = "pit-report-latest.mp4";
const POSTER = "pit-report-latest.jpg";
const SIGNED_SECONDS = 60 * 60;

async function signedUrl(path: string): Promise<string | null> {
  const db = createServiceRoleClient();
  if (!db) return null;
  const { data, error } = await db.storage.from(BUCKET).createSignedUrl(path, SIGNED_SECONDS);
  if (error) return null;
  return data.signedUrl;
}

function Feed({ events }: { events: OpsEvent[] }) {
  return (
    <section aria-labelledby="ops-feed">
      <h2 id="ops-feed" className="mb-3 text-[20px] font-semibold text-[var(--color-text)]">
        What they just did
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

const HALT_NOTICE: Record<string, string> = {
  cleared: "Halt cleared. Sending resumes on the next pass.",
  error: "Couldn't clear the halt. It's still on; try again.",
  denied: "Only the owner can clear the halt.",
};

export default async function OpsPage({ searchParams }: { searchParams: Promise<{ halt?: string | string[] }> }) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!isOwner(user?.email)) notFound();

  const haltParam = (await searchParams).halt;
  const notice = typeof haltParam === "string" ? (HALT_NOTICE[haltParam] ?? null) : null;
  const now = new Date();
  const [ops, video, poster, runs, halt, pipeline, campaigns] = await Promise.all([
    getOps(),
    signedUrl(VIDEO),
    signedUrl(POSTER),
    lastRuns(supabase),
    haltFlag(supabase),
    pipelineSnapshot(supabase).catch(() => null),
    // The Outreach Writer's first-email batches wait as draft campaigns until a person approves them.
    supabase
      .from("email_campaigns")
      .select("id", { count: "exact", head: true })
      .eq("status", "draft")
      .eq("created_by", "agent:outreach-writer")
      .then((r) => r.count ?? 0),
  ]);
  const waiting = [
    { label: "drafts waiting for your OK", count: pipeline?.draftsPending ?? 0, href: "/admin/inbox?folder=drafts", action: "Review" },
    { label: campaigns === 1 ? "batch of first emails to approve" : "batches of first emails to approve", count: campaigns, href: "/admin/campaigns", action: "Approve" },
  ];

  return (
    <div className="max-w-[1204px]">
      <AdminHeader title="Agent Ops" subtitle={ops.lede} />

      <div className="grid grid-cols-1 gap-x-11 gap-y-12 min-[1100px]:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-w-0 flex-col gap-10">
          <RightNow halt={halt} checks={ops.checks} waiting={waiting} when={(iso) => whenSaid(iso, now)} notice={notice} />
          <Brief run={runs["mission-control"]} when={(iso) => whenSaid(iso, now)} />
          <Funnel p={pipeline} />
          <Crew runs={runs} seats={ops.agents} when={(iso) => whenSaid(iso, now)} />

          <details className="card group overflow-hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between px-6 py-5 text-[16px] font-semibold text-[var(--color-text)] hover:bg-[var(--color-bg-hover)] sm:px-8">
              Pit Report
              <span className="text-[14px] font-normal text-[var(--color-text-dim)] group-open:hidden">Each agent&apos;s results, from live CRM rows</span>
            </summary>
            {video ? (
              <video src={video} poster={poster ?? undefined} controls playsInline preload="none" className="block aspect-video w-full bg-black" />
            ) : (
              <p className="px-6 pb-6 text-[15px] text-[var(--color-text-muted)] sm:px-8">The Pit Report shows up here once the worker has built it.</p>
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
