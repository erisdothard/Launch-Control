import "server-only";
import type { StoreClient } from "@/lib/store/db";
import { getToday } from "@/lib/store/today";
import { getLeadById, getLeads, updateLead } from "@/lib/store/leads";
import { getThread } from "@/lib/store/messages";
import { getPendingDrafts } from "@/lib/store/drafts";
import { listCampaigns } from "@/lib/store/campaigns";
import { teamTodayISO } from "@/lib/leads/followUp";
import { LEAD_VIEWS, type Lead } from "@/lib/store/types";

// What Max's AI can do in the CRM (Eris, 2026-11-17: "read write", "can't actually send", "no real
// access to the code"). Reads cover his Today list, leads, threads, drafts and campaigns. Writes
// are a draft, a note and a follow-up date. Nothing here sends: a draft waits in the CRM for Max to
// press Send, and AI drafts are "reply" drafts, which no automation sends on its own.

export interface ToolContext {
  email: string;
  client: StoreClient;
}

type Args = Record<string, unknown>;

interface Tool {
  name: string;
  title: string;
  description: string;
  readOnly: boolean;
  inputSchema: Record<string, unknown>;
  run: (args: Args, ctx: ToolContext) => Promise<unknown>;
}

export class ToolInputError extends Error {}

const MAX_BODY = 20_000;
const MAX_NOTES = 50_000;

/** A real calendar date (2026-02-31 is not). */
function isRealDate(s: string): boolean {
  const d = new Date(`${s}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VIEW_KEYS = LEAD_VIEWS.map((v) => v.key);

function text(args: Args, key: string, { required = false, max = 500 } = {}): string {
  const v = args[key];
  if (v === undefined || v === null || v === "") {
    if (required) throw new ToolInputError(`${key} is required.`);
    return "";
  }
  if (typeof v !== "string") throw new ToolInputError(`${key} must be text.`);
  if (v.length > max) throw new ToolInputError(`${key} is too long (max ${max} characters).`);
  return v.trim();
}

function id(args: Args, key: string): string {
  const v = text(args, key, { required: true, max: 64 });
  if (!UUID.test(v)) throw new ToolInputError(`${key} must be an id from this CRM.`);
  return v;
}

function clip(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

function leadSummary(l: Lead) {
  return {
    lead_id: l.id,
    business: l.businessName,
    contact: l.prospect?.contactName ?? null,
    email: l.email,
    phone: l.phone,
    status: l.status,
    why: l.statusReason,
    waiting_on: l.awaiting === "us" ? "us" : l.awaiting === "them" ? "them" : null,
    next_action: l.nextAction,
    follow_up_on: l.followUpOn,
    last_emailed: l.lastContactedAt,
    last_reply: l.lastReplyAt,
  };
}

async function requireLead(leadId: string, client: StoreClient): Promise<Lead> {
  const lead = await getLeadById(leadId, client);
  if (!lead) throw new ToolInputError("No lead with that id.");
  return lead;
}

export const TOOLS: Tool[] = [
  {
    name: "get_today",
    title: "Today",
    description:
      "Max's Today list from the CRM: who needs a reply, follow-ups due, new inquiries, today's meetings, with any draft already written. Start here when asked what to do today.",
    readOnly: true,
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    run: async (_args, { email, client }) => {
      const t = await getToday(email, client);
      return {
        items: t.items.map((i) => ({
          lead_id: i.leadId,
          name: i.name,
          company: i.company,
          kind: i.kind,
          waiting: i.waitLabel,
          they_wrote: i.quote ? clip(i.quote.text, 1500) : null,
          draft: i.draft ? { draft_id: i.draft.id, subject: i.draft.subject, body: i.draft.body } : null,
          email: i.email,
          phone: i.phone,
        })),
        follow_up_maybe: (t.gentle ?? []).map((g) => g),
        meetings: t.agenda,
      };
    },
  },
  {
    name: "search_leads",
    title: "Find leads",
    description: `Search leads by business, person, email or phone, or list one view. Views: ${VIEW_KEYS.join(", ")}.`,
    readOnly: true,
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Words to search for. Leave out to list a view." },
        view: { type: "string", enum: VIEW_KEYS },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 25 },
      },
      additionalProperties: false,
    },
    run: async (args, { client }) => {
      const query = text(args, "query", { max: 200 });
      const view = text(args, "view", { max: 40 });
      if (view && !VIEW_KEYS.includes(view as (typeof VIEW_KEYS)[number])) throw new ToolInputError("Unknown view.");
      const limit = Math.min(100, Math.max(1, Number(args.limit) || 25));
      const leads = await getLeads(
        { search: query || undefined, view: (view || undefined) as (typeof VIEW_KEYS)[number] | undefined, today: teamTodayISO() },
        client
      );
      return { count: leads.length, leads: leads.slice(0, limit).map(leadSummary) };
    },
  },
  {
    name: "get_lead",
    title: "Open a lead",
    description: "One lead with its notes and its email thread (newest last).",
    readOnly: true,
    inputSchema: { type: "object", properties: { lead_id: { type: "string" } }, required: ["lead_id"], additionalProperties: false },
    run: async (args, { client }) => {
      const lead = await requireLead(id(args, "lead_id"), client);
      const thread = await getThread(lead.id, client);
      return {
        ...leadSummary(lead),
        notes: lead.notes,
        emails: thread.slice(-20).map((m) => ({
          direction: m.direction === "in" ? "from them" : "from us",
          from: m.fromAddress,
          subject: m.subject,
          body: clip(m.bodyText, 4000),
          at: m.createdAt,
        })),
      };
    },
  },
  {
    name: "list_drafts",
    title: "Drafts waiting",
    description: "Email drafts waiting in the CRM for Max to read and send.",
    readOnly: true,
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    run: async (_args, { client }) => {
      const drafts = await getPendingDrafts(client);
      return drafts.map((d) => ({
        draft_id: d.id,
        lead_id: d.leadId,
        business: d.businessName,
        to: d.to,
        kind: d.kind === "follow_up" ? "follow-up" : "reply",
        subject: d.subject,
        body: d.body,
      }));
    },
  },
  {
    name: "list_campaigns",
    title: "Campaigns",
    description: "Email campaigns: waiting to be sent, sending, or sent, with how many went out and replied.",
    readOnly: true,
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    run: async (_args, { client }) => {
      const list = await listCampaigns(client);
      return list.slice(0, 50).map((c) => ({ name: c.name, subject: c.subject, status: c.status, from: c.fromAddress, created: c.createdAt, counts: c.counts }));
    },
  },
  {
    name: "save_draft",
    title: "Write a draft",
    description:
      "Write an email to a lead. It is saved as a draft in the CRM (replacing that lead's waiting draft if there is one). It is NOT sent: Max reads it and presses Send in the CRM. Plain text, no signature (the CRM adds it).",
    readOnly: false,
    inputSchema: {
      type: "object",
      properties: { lead_id: { type: "string" }, subject: { type: "string" }, body: { type: "string" } },
      required: ["lead_id", "subject", "body"],
      additionalProperties: false,
    },
    run: async (args, { client }) => {
      const lead = await requireLead(id(args, "lead_id"), client);
      const subject = text(args, "subject", { required: true, max: 300 }).replace(/[\r\n]+/g, " ");
      const body = text(args, "body", { required: true, max: MAX_BODY });
      if (!lead.email) throw new ToolInputError("This lead has no email address.");
      if (lead.doNotContact) throw new ToolInputError("This lead asked not to be contacted.");

      const waiting = (await getPendingDrafts(client)).filter((d) => d.leadId === lead.id);
      // An automatic follow-up can be sent by automation, so the AI never writes into one.
      if (waiting.some((d) => d.kind === "follow_up")) {
        throw new ToolInputError("This lead has an automatic follow-up waiting. Max can edit it in the CRM.");
      }
      const existing = waiting.find((d) => d.kind === "reply");
      if (existing) {
        const { data: updated, error } = await client
          .from("email_drafts")
          .update({ subject, body_text: body, updated_at: new Date().toISOString() })
          .eq("id", existing.id)
          .eq("kind", "reply")
          .eq("status", "pending")
          .select("id");
        if (error) throw error;
        if (!updated?.length) throw new ToolInputError("That draft was just sent or removed. Try again.");
        return { saved: true, draft_id: existing.id, replaced_existing: true, sent: false };
      }
      // Thread it under their last email when that message has no draft yet.
      const lastIn = [...(await getThread(lead.id, client))].reverse().find((m) => m.direction === "in");
      const row = { lead_id: lead.id, kind: "reply", to_address: lead.email, subject, body_text: body, status: "pending" };
      let { data, error } = await client
        .from("email_drafts")
        .insert({ ...row, reply_to_message_id: lastIn?.id ?? null })
        .select("id")
        .single();
      if (error?.code === "23505") ({ data, error } = await client.from("email_drafts").insert(row).select("id").single());
      if (error || !data) throw error ?? new Error("Couldn't save the draft.");
      return { saved: true, draft_id: data.id, replaced_existing: false, sent: false };
    },
  },
  {
    name: "add_note",
    title: "Add a note",
    description: "Add a dated note to a lead (kept under its existing notes).",
    readOnly: false,
    inputSchema: {
      type: "object",
      properties: { lead_id: { type: "string" }, note: { type: "string" } },
      required: ["lead_id", "note"],
      additionalProperties: false,
    },
    run: async (args, { client }) => {
      const lead = await requireLead(id(args, "lead_id"), client);
      const note = text(args, "note", { required: true, max: 4000 });
      const notes = [lead.notes.trim(), `${teamTodayISO()} (AI): ${note}`].filter(Boolean).join("\n\n");
      if (notes.length > MAX_NOTES) throw new ToolInputError("This lead's notes are full. Tidy them in the CRM first.");
      await updateLead(lead.id, { notes }, client);
      return { saved: true };
    },
  },
  {
    name: "set_follow_up",
    title: "Set a follow-up",
    description: "Set or clear the date Max is reminded to follow up with a lead, and optionally what to do then.",
    readOnly: false,
    inputSchema: {
      type: "object",
      properties: {
        lead_id: { type: "string" },
        date: { type: ["string", "null"], description: "YYYY-MM-DD, or null to clear." },
        next_action: { type: "string", description: "What to do then, in a few words." },
      },
      required: ["lead_id", "date"],
      additionalProperties: false,
    },
    run: async (args, { client }) => {
      const lead = await requireLead(id(args, "lead_id"), client);
      const date = args.date === null ? null : text(args, "date", { required: true, max: 10 });
      if (date !== null && (!DATE.test(date) || !isRealDate(date))) throw new ToolInputError("date must be YYYY-MM-DD or null.");
      const nextAction = text(args, "next_action", { max: 200 });
      await updateLead(lead.id, { followUpOn: date, ...(nextAction ? { nextAction } : {}) }, client);
      return { saved: true, follow_up_on: date };
    },
  },
];

export function findTool(name: unknown): Tool | undefined {
  return TOOLS.find((t) => t.name === name);
}
