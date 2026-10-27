import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { HALT_KEY } from "./halt";

// The crew's logbook as the Ops board reads it: the newest agent_runs row per agent and the
// Guardian's halt flag. Written by tools/leadgen/leadgen/agent_log.py; this side only reads, plus
// the one write a person makes (clearing the halt, in the Ops page's server action).

export const CREW = [
  { key: "mission-control", name: "Mission Control", job: "Runs the crew and writes the brief" },
  { key: "guardian", name: "Guardian", job: "Checks everything before it leaves" },
  { key: "prospector", name: "Prospector", job: "Finds who's worth contacting" },
  { key: "outreach-writer", name: "Outreach Writer", job: "Writes first emails as drafts for approval" },
  { key: "strategist", name: "Strategist", job: "Learns what's working, proposes where to aim" },
] as const;

export type CrewKey = (typeof CREW)[number]["key"];

export interface AgentRun {
  id: string;
  agent: string;
  startedAt: string;
  finishedAt: string | null;
  status: "running" | "done" | "failed" | "halted";
  decision: string;
  evidence: Record<string, unknown>;
  error: string | null;
}

export interface HaltFlag {
  /** null: the flag couldn't be read, which senders treat as halted. */
  halted: boolean | null;
  updatedAt: string | null;
  updatedBy: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, any, any>;

interface RunRow {
  id: string;
  agent: string;
  started_at: string;
  finished_at: string | null;
  status: AgentRun["status"];
  decision: string | null;
  evidence: unknown;
  error: string | null;
}

function toRun(r: RunRow): AgentRun {
  const ev = r.evidence && typeof r.evidence === "object" && !Array.isArray(r.evidence) ? (r.evidence as Record<string, unknown>) : {};
  return {
    id: r.id,
    agent: r.agent,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    status: r.status,
    decision: r.decision ?? "",
    evidence: ev,
    error: r.error,
  };
}

/**
 * Newest run per agent. One query per agent so the Guardian's frequent passes can't crowd the
 * others out (same reasoning as agent_log.last_runs). A failed read is `undefined`; never ran is null.
 */
export async function lastRuns(client: unknown): Promise<Record<CrewKey, AgentRun | null | undefined>> {
  const db = client as AnyClient;
  const rows = await Promise.all(
    CREW.map(async (a) => {
      const { data, error } = await db
        .from("agent_runs")
        .select("id, agent, started_at, finished_at, status, decision, evidence, error")
        .eq("agent", a.key)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) return [a.key, undefined] as const;
      return [a.key, data ? toRun(data as RunRow) : null] as const;
    })
  );
  return Object.fromEntries(rows) as Record<CrewKey, AgentRun | null | undefined>;
}

export async function haltFlag(client: unknown): Promise<HaltFlag> {
  const { data, error } = await (client as AnyClient).from("system_flags").select("value, updated_at, updated_by").eq("key", HALT_KEY).maybeSingle();
  if (error || !data) return { halted: null, updatedAt: null, updatedBy: "" };
  return { halted: data.value === false ? false : data.value === true ? true : null, updatedAt: data.updated_at, updatedBy: data.updated_by ?? "" };
}

/** Evidence worth a glance: top-level numbers and yes/no facts, in the order the agent wrote them. */
export function keyNumbers(evidence: Record<string, unknown>, max = 6): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  for (const [k, v] of Object.entries(evidence)) {
    if (out.length >= max) break;
    if (typeof v === "number" && Number.isFinite(v)) {
      const rate = /rate$/i.test(k) && v >= 0 && v <= 1;
      out.push({ label: k.replace(/_/g, " "), value: rate ? `${Math.round(v * 100)}%` : v.toLocaleString("en-US") });
    } else if (typeof v === "boolean") {
      out.push({ label: k.replace(/_/g, " "), value: v ? "yes" : "no" });
    }
  }
  return out;
}
