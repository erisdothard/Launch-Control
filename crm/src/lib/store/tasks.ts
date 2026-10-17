import { getStoreClient, type StoreClient } from "./db";
import { logActivity } from "./activity";
import type { Task, TaskRelatedType } from "./types";

export type { Task, TaskRelatedType } from "./types";

interface TaskRow {
  id: string;
  title: string;
  due_date: string | null;
  done: boolean;
  related_type: TaskRelatedType | null;
  related_id: string | null;
  related_label: string | null;
  created_at: string;
}

function rowToTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    dueDate: row.due_date,
    done: row.done,
    relatedType: row.related_type,
    relatedId: row.related_id,
    relatedLabel: row.related_label,
    createdAt: row.created_at,
  };
}

export async function getTasks(client?: StoreClient): Promise<Task[]> {
  const supabase = await getStoreClient(client);
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .order("done", { ascending: true })
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data as TaskRow[]).map(rowToTask);
}

export interface CreateTaskInput {
  title: string;
  dueDate: string | null;
  relatedType?: TaskRelatedType | null;
  relatedId?: string | null;
  relatedLabel?: string | null;
}

export async function createTask(input: CreateTaskInput, client?: StoreClient): Promise<Task> {
  const supabase = await getStoreClient(client);
  const { data, error } = await supabase
    .from("tasks")
    .insert({
      title: input.title,
      due_date: input.dueDate,
      done: false,
      related_type: input.relatedType ?? null,
      related_id: input.relatedId ?? null,
      related_label: input.relatedLabel ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  const task = rowToTask(data as TaskRow);

  await logActivity({ entityType: "task", entityId: task.id, entityLabel: task.title, action: "created" }, client);

  return task;
}

export async function setTaskDone(id: string, done: boolean, client?: StoreClient): Promise<Task | null> {
  const supabase = await getStoreClient(client);
  const { data, error } = await supabase.from("tasks").update({ done }).eq("id", id).select().maybeSingle();

  if (error) throw error;
  if (!data) return null;
  const task = rowToTask(data as TaskRow);

  await logActivity(
    { entityType: "task", entityId: id, entityLabel: task.title, action: "status_changed", detail: done ? "→ done" : "→ reopened" },
    client
  );

  return task;
}

export async function deleteTask(id: string, client?: StoreClient): Promise<boolean> {
  const supabase = await getStoreClient(client);
  const { data, error } = await supabase.from("tasks").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return false;
  const task = rowToTask(data as TaskRow);

  const { error: deleteError } = await supabase.from("tasks").delete().eq("id", id);
  if (deleteError) throw deleteError;

  await logActivity({ entityType: "task", entityId: id, entityLabel: task.title, action: "deleted" }, client);

  return true;
}
