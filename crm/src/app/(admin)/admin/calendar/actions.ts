"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createEvent, deleteEvent, updateEvent, type EventInput } from "@/lib/store/calendar";

type Result = { ok: true } | { ok: false; error: string };

const MAX_EVENT_MS = 14 * 24 * 60 * 60 * 1000;
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

function validate(raw: EventInput): EventInput | string {
  const title = str(raw.title, 200);
  if (!title) return "Give it a title.";
  const start = Date.parse(raw.startsAt);
  const end = Date.parse(raw.endsAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "Pick a valid date and time.";
  if (end < start) return "The end is before the start.";
  if (end - start > MAX_EVENT_MS) return "Events can be up to two weeks long.";
  const leadId = typeof raw.leadId === "string" && /^[0-9a-f-]{36}$/i.test(raw.leadId) ? raw.leadId : null;
  return {
    title,
    startsAt: new Date(start).toISOString(),
    endsAt: new Date(end).toISOString(),
    allDay: raw.allDay === true,
    location: str(raw.location, 300),
    notes: str(raw.notes, 5000),
    leadId,
  };
}

function revalidate(leadId: string | null) {
  revalidatePath("/admin/calendar");
  revalidatePath("/admin/dashboard");
  if (leadId) revalidatePath(`/admin/leads/${leadId}`);
}

export async function saveEventAction(id: string | null, raw: EventInput): Promise<Result> {
  const input = validate(raw);
  if (typeof input === "string") return { ok: false, error: input };
  try {
    if (id) {
      const updated = await updateEvent(id, input);
      if (!updated) return { ok: false, error: "That event no longer exists." };
    } else {
      const supabase = await createServerSupabaseClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.email) return { ok: false, error: "You're signed out. Sign in again." };
      await createEvent(input, user.email);
    }
  } catch {
    return { ok: false, error: "Couldn't save. Try again." };
  }
  revalidate(input.leadId);
  return { ok: true };
}

export async function deleteEventAction(id: string, leadId: string | null): Promise<Result> {
  try {
    await deleteEvent(id);
  } catch {
    return { ok: false, error: "Couldn't delete. Try again." };
  }
  revalidate(leadId);
  return { ok: true };
}
