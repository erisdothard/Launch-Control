import { getStoreClient, type StoreClient } from "./db";
import type { ActivityEntry } from "./types";

export type { ActivityEntry } from "./types";

interface ActivityRow {
  id: string;
  entity_type: ActivityEntry["entityType"];
  entity_id: string;
  entity_label: string;
  action: ActivityEntry["action"];
  detail: string | null;
  created_at: string;
}

function rowToEntry(row: ActivityRow): ActivityEntry {
  return {
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    entityLabel: row.entity_label,
    action: row.action,
    detail: row.detail ?? undefined,
    createdAt: row.created_at,
  };
}

// Logs but never throws — activity logging should never block the mutation
// that triggered it. Mirrors the proven pattern from the Hyper Racer CRM.
export async function logActivity(
  params: Omit<ActivityEntry, "id" | "createdAt">,
  client?: StoreClient
): Promise<void> {
  try {
    const supabase = await getStoreClient(client);
    const { error } = await supabase.from("activity_log").insert({
      entity_type: params.entityType,
      entity_id: params.entityId,
      entity_label: params.entityLabel,
      action: params.action,
      detail: params.detail ?? null,
    });
    if (error) throw error;
  } catch (err) {
    console.error("[activity] failed to log:", err);
  }
}

export async function getActivityLog(limit = 50, client?: StoreClient): Promise<ActivityEntry[]> {
  const supabase = await getStoreClient(client);
  const { data, error } = await supabase
    .from("activity_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data as ActivityRow[]).map(rowToEntry);
}
