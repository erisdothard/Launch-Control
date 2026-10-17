import { getStoreClient, type StoreClient } from "./db";
import { AUTOMATED_LEAD_SOURCE, type LeadGenRun } from "./types";

export type { LeadGenRun, LeadGenRunStatus } from "./types";

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
  };
}

// Runs are written by the Python pipeline (tools/leadgen); the CRM only reads them.
export async function getRuns(limit = 10, client?: StoreClient): Promise<LeadGenRun[]> {
  const supabase = await getStoreClient(client);
  const { data, error } = await supabase
    .from("lead_gen_runs")
    .select("id, status, started_at, finished_at, found, enriched, kept, excluded, error")
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
