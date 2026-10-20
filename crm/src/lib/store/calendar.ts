import { getStoreClient, type StoreClient } from "./db";
import type { CalendarEvent } from "./types";

export type { CalendarEvent } from "./types";

interface EventRow {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  location: string;
  notes: string;
  lead_id: string | null;
  created_by: string;
  created_at: string;
}

function rowToEvent(row: EventRow): CalendarEvent {
  return {
    id: row.id,
    title: row.title,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    allDay: row.all_day,
    location: row.location,
    notes: row.notes,
    leadId: row.lead_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

const COLUMNS = "id, title, starts_at, ends_at, all_day, location, notes, lead_id, created_by, created_at";

/** Events overlapping [from, to). */
export async function getEvents(from: string, to: string, client?: StoreClient): Promise<CalendarEvent[]> {
  const supabase = await getStoreClient(client);
  const { data, error } = await supabase
    .from("calendar_events")
    .select(COLUMNS)
    .lt("starts_at", to)
    .gte("ends_at", from)
    .order("starts_at", { ascending: true });
  if (error) throw error;
  return (data as EventRow[]).map(rowToEvent);
}

export async function getUpcomingEventsForLead(leadId: string, client?: StoreClient): Promise<CalendarEvent[]> {
  const supabase = await getStoreClient(client);
  const { data, error } = await supabase
    .from("calendar_events")
    .select(COLUMNS)
    .eq("lead_id", leadId)
    .gte("ends_at", new Date().toISOString())
    .order("starts_at", { ascending: true })
    .limit(5);
  if (error) throw error;
  return (data as EventRow[]).map(rowToEvent);
}

export interface EventInput {
  title: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  location: string;
  notes: string;
  leadId: string | null;
}

export async function createEvent(input: EventInput, createdBy: string, client?: StoreClient): Promise<CalendarEvent> {
  const supabase = await getStoreClient(client);
  const { data, error } = await supabase
    .from("calendar_events")
    .insert({
      title: input.title,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      all_day: input.allDay,
      location: input.location,
      notes: input.notes,
      lead_id: input.leadId,
      created_by: createdBy,
    })
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return rowToEvent(data as EventRow);
}

export async function updateEvent(id: string, input: EventInput, client?: StoreClient): Promise<CalendarEvent | null> {
  const supabase = await getStoreClient(client);
  const { data, error } = await supabase
    .from("calendar_events")
    .update({
      title: input.title,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      all_day: input.allDay,
      location: input.location,
      notes: input.notes,
      lead_id: input.leadId,
    })
    .eq("id", id)
    .select(COLUMNS)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToEvent(data as EventRow) : null;
}

export async function deleteEvent(id: string, client?: StoreClient): Promise<void> {
  const supabase = await getStoreClient(client);
  const { error } = await supabase.from("calendar_events").delete().eq("id", id);
  if (error) throw error;
}
