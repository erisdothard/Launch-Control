import { getStoreClient, type StoreClient } from "./db";
import type { Json } from "@/lib/supabase/types";
import { AUTOMATED_LEAD_SOURCE, type LeadGenParams, type LeadGenRun } from "./types";

export type { LeadGenParams, LeadGenRun, LeadGenRunStatus } from "./types";

interface RunRow {
  id: string;
  status: LeadGenRun["status"];
  started_at: string;
  finished_at: string | null;
  found: number;
  enriched: number;
  kept: number;
  excluded: number;
  error: string | null;
  stage: string | null;
  params: unknown;
  requested_by: string | null;
}

const RUN_COLUMNS =
  "id, status, started_at, finished_at, found, enriched, kept, excluded, error, stage, params, requested_by";

function toParams(value: unknown): LeadGenParams {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as LeadGenParams) : {};
}

function rowToRun(row: RunRow): LeadGenRun {
  return {
    id: row.id,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    found: row.found,
    enriched: row.enriched,
    kept: row.kept,
    excluded: row.excluded,
    error: row.error,
    stage: row.stage,
    params: toParams(row.params),
    requestedBy: row.requested_by,
  };
}

// Runs are queued here (Find leads) and claimed, advanced and finished by the worker
// (tools/leadgen `leadgen worker` on Railway).
export async function getRuns(limit = 10, client?: StoreClient): Promise<LeadGenRun[]> {
  const supabase = await getStoreClient(client);
  const { data, error } = await supabase
    .from("lead_gen_runs")
    .select(RUN_COLUMNS)
    .order("started_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data as RunRow[]).map(rowToRun);
}

export interface LeadGenFacets {
  segments: string[];
  states: string[];
}

// Distinct segment/state values among generated leads, for the filter dropdowns.
export async function getFacets(client?: StoreClient): Promise<LeadGenFacets> {
  const supabase = await getStoreClient(client);
  const { data, error } = await supabase.from("leads").select("segment, state").eq("source", AUTOMATED_LEAD_SOURCE);

  if (error) throw error;
  const rows = data as { segment: string | null; state: string | null }[];
  const distinct = (values: (string | null)[]) =>
    [...new Set(values.filter((v): v is string => Boolean(v)))].sort((a, b) => a.localeCompare(b));

  return { segments: distinct(rows.map((r) => r.segment)), states: distinct(rows.map((r) => r.state)) };
}

// The database allows one queued-or-running run at a time (unique partial index); a second
// request fails with 23505 and is reported as "already running".
export async function queueRun(params: LeadGenParams, requestedBy: string, client?: StoreClient): Promise<LeadGenRun> {
  const supabase = await getStoreClient(client);
  const { data, error } = await supabase
    .from("lead_gen_runs")
    .insert({ status: "queued", params: params as Json, requested_by: requestedBy })
    .select(RUN_COLUMNS)
    .single();

  if (error?.code === "23505") throw new Error("A lead search is already running. Wait for it or cancel it.");
  if (error) throw error;
  return rowToRun(data as RunRow);
}

// A queued run is cancelled outright; a running one is marked and the worker stops at its next stage.
export async function cancelRun(id: string, client?: StoreClient): Promise<void> {
  const supabase = await getStoreClient(client);
  const { error } = await supabase
    .from("lead_gen_runs")
    .update({ status: "cancelled", finished_at: new Date().toISOString(), stage: null })
    .eq("id", id)
    .in("status", ["queued", "running"]);

  if (error) throw error;
}
