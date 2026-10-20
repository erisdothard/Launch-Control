import "server-only";
import type { CalendarEvent } from "@/lib/store/types";
import { emailConfig } from "./config";
import { createOutlookEvent, deleteOutlookEvent, outlookCalendarView, updateOutlookEvent, type EventFields } from "./outlook";
import { outlookAccessToken, primaryOutlookAccount } from "./outlookAccount";

// Keeps the CRM calendar and the shared mailbox's Outlook calendar in step: CRM meetings are written
// to Outlook (so they reach everyone's phone), and Outlook events are shown read-only in the CRM.

export type MirrorResult = { outlookEventId: string | null; warning: string | null };

const WARNING = "Saved in the CRM, but Outlook didn't take the change. It will show here only.";

/** Create or update the Outlook copy of a CRM event. Never throws: the CRM save already happened. */
export async function mirrorToOutlook(fields: EventFields, existingOutlookId: string | null): Promise<MirrorResult> {
  const account = await primaryOutlookAccount();
  if (!account) return { outlookEventId: existingOutlookId, warning: null };
  try {
    const token = await outlookAccessToken(account.id);
    if (existingOutlookId) {
      await updateOutlookEvent(token, existingOutlookId, fields, emailConfig.teamTimeZone);
      return { outlookEventId: existingOutlookId, warning: null };
    }
    const created = await createOutlookEvent(token, fields, emailConfig.teamTimeZone);
    return { outlookEventId: created.id, warning: null };
  } catch {
    return { outlookEventId: existingOutlookId, warning: WARNING };
  }
}

export async function removeFromOutlook(outlookEventId: string | null): Promise<string | null> {
  if (!outlookEventId) return null;
  const account = await primaryOutlookAccount();
  if (!account) return null;
  try {
    await deleteOutlookEvent(await outlookAccessToken(account.id), outlookEventId);
    return null;
  } catch {
    return "Deleted in the CRM, but it may still be on the Outlook calendar.";
  }
}

/**
 * Outlook events in [from, to) that didn't come from the CRM, shaped like CRM events. All-day
 * events carry a local-midnight timestamp without a zone so the browser places them on the right day.
 */
export async function outlookOnlyEvents(from: string, to: string, crmOutlookIds: Set<string>): Promise<{ events: CalendarEvent[]; error: boolean }> {
  const account = await primaryOutlookAccount();
  if (!account) return { events: [], error: false };
  try {
    const items = await outlookCalendarView(await outlookAccessToken(account.id), from, to);
    const events = items
      .filter((e) => !crmOutlookIds.has(e.id))
      .map<CalendarEvent>((e) => ({
        id: `outlook-${e.id}`,
        title: e.subject || "(no title)",
        startsAt: e.isAllDay ? `${e.start.dateTime.slice(0, 10)}T00:00:00` : `${e.start.dateTime.replace(/\.\d+$/, "")}Z`,
        endsAt: e.isAllDay ? `${e.end.dateTime.slice(0, 10)}T00:00:00` : `${e.end.dateTime.replace(/\.\d+$/, "")}Z`,
        allDay: e.isAllDay,
        location: e.location?.displayName ?? "",
        notes: e.bodyPreview ?? "",
        leadId: null,
        createdBy: e.organizer?.emailAddress?.address ?? account.address,
        createdAt: "",
        outlookEventId: e.id,
        outlookLink: e.webLink ?? null,
      }));
    return { events, error: false };
  } catch {
    return { events: [], error: true };
  }
}
