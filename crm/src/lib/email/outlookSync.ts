import "server-only";
import { emailConfig, outlookAppOnly } from "./config";
import { appOnlyToken } from "./outlook";
import { stripQuotedReply } from "./text";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";

// Pulls new mail from the shared Outlook mailbox into email_messages, from the CRM itself.
// A port of tools/leadgen/leadgen/outlook_sync.py (app-only mode) so incoming mail doesn't depend
// on the worker running. Both write the same cursor (email_accounts.sync_cursor, v2) and the same
// idempotent insert, so whichever runs first wins and the other finds nothing new.

const GRAPH = "https://graph.microsoft.com/v1.0";
// Graph folder -> email_messages.folder. Junk and Deleted Items are deliberately absent.
const FOLDERS: Record<string, string> = { inbox: "inbox", sentitems: "sent" };
const CURSOR_VERSION = 2;
const FIRST_RUN_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;
const SELECT = "id,conversationId,internetMessageId,from,toRecipients,ccRecipients,subject,body,receivedDateTime,isDraft,isRead,hasAttachments";
const PREFER = 'IdType="ImmutableId", outlook.body-content-type="text", odata.maxpagesize=50';
/** Page loads trigger a sync at most this often (the worker's own loop runs every 120s). */
const MIN_GAP_MS = 90 * 1000;
const HEARTBEAT = "crm-mail-sync";
const CHUNK = 80;

type Admin = NonNullable<ReturnType<typeof createServiceRoleClient>>;

interface GraphAddress {
  emailAddress?: { address?: string; name?: string };
}

interface GraphMessage {
  id: string;
  conversationId?: string;
  internetMessageId?: string;
  from?: GraphAddress;
  toRecipients?: GraphAddress[];
  ccRecipients?: GraphAddress[];
  subject?: string;
  body?: { content?: string };
  receivedDateTime?: string;
  isDraft?: boolean;
  isRead?: boolean;
  hasAttachments?: boolean;
  "@removed"?: unknown;
  _folder?: string;
}

class DeltaExpired extends Error {}

const address = (a: GraphAddress | undefined) => (a?.emailAddress?.address ?? "").toLowerCase();
const addresses = (list: GraphAddress[] | undefined) => (list ?? []).map(address).filter(Boolean);

function displayName(a: GraphAddress | undefined): string {
  const name = (a?.emailAddress?.name ?? "").trim();
  // Outlook fills the name with the address itself when it has nothing better.
  return name.includes("@") && name.toLowerCase() === address(a) ? "" : name;
}

/** The new part of a reply: Outlook's "From: ... Sent:" block, signatures and quotes are dropped. */
export function replyText(text: string): string {
  const out: string[] = [];
  for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
    if (line.startsWith("From: ") || (/^(-- ?|_{5,})$/.test(line.trim()) && out.length)) break;
    out.push(line);
  }
  return stripQuotedReply(out.join("\n"));
}

function startUrl(folder: string, since: Date): string {
  const stamp = since.toISOString().replace(/\.\d{3}Z$/, "Z");
  return `${GRAPH}/users/${encodeURIComponent(emailConfig.msAppMailbox)}/mailFolders/${folder}/messages/delta?$select=${SELECT}&$filter=receivedDateTime+ge+${stamp}`;
}

async function walkFolder(token: string, url: string): Promise<{ messages: GraphMessage[]; next: string }> {
  const messages: GraphMessage[] = [];
  for (;;) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Prefer: PREFER }, cache: "no-store" });
    if (res.status === 410) throw new DeltaExpired();
    if (!res.ok) throw new Error(`Graph ${res.status}`);
    const body = (await res.json()) as { value?: GraphMessage[]; "@odata.nextLink"?: string; "@odata.deltaLink"?: string };
    messages.push(...(body.value ?? []).filter((m) => !m["@removed"] && !m.isDraft));
    if (body["@odata.nextLink"]) {
      url = body["@odata.nextLink"];
      continue;
    }
    return { messages, next: body["@odata.deltaLink"] ?? url };
  }
}

async function attachmentMeta(token: string, messageId: string): Promise<Json> {
  // Names and sizes only; the bytes stay in Outlook until someone opens one in the CRM.
  const url = `${GRAPH}/users/${encodeURIComponent(emailConfig.msAppMailbox)}/messages/${messageId}/attachments?$select=id,name,size,contentType,isInline`;
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Prefer: PREFER }, cache: "no-store" });
    if (!res.ok) return [];
    const items = ((await res.json()) as { value?: { id?: string; name?: string; size?: number; contentType?: string; isInline?: boolean }[] }).value ?? [];
    return items
      .filter((a) => a.id && !a.isInline)
      .map((a) => ({ name: a.name || "attachment", size: a.size ?? 0, type: a.contentType || "application/octet-stream", provider_id: a.id as string }));
  } catch {
    return [];
  }
}

async function inChunks<T>(values: string[], read: (chunk: string[]) => Promise<T[]>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < values.length; i += CHUNK) out.push(...(await read(values.slice(i, i + CHUNK))));
  return out;
}

async function syncMailbox(db: Admin, account: { id: string; address: string; sync_cursor: string | null }): Promise<number> {
  const token = await appOnlyToken("graph");
  let saved: Record<string, unknown> = {};
  try {
    saved = JSON.parse(account.sync_cursor || "{}") as Record<string, unknown>;
  } catch {
    saved = {};
  }
  const cursors: Record<string, unknown> = saved.v === CURSOR_VERSION ? saved : {};
  cursors.v = CURSOR_VERSION;
  const since = new Date(Date.now() - FIRST_RUN_LOOKBACK_MS);

  const found: GraphMessage[] = [];
  for (const folder of Object.keys(FOLDERS)) {
    const resume = typeof cursors[folder] === "string" ? (cursors[folder] as string) : startUrl(folder, since);
    let walked: { messages: GraphMessage[]; next: string };
    try {
      walked = await walkFolder(token, resume);
    } catch (err) {
      if (!(err instanceof DeltaExpired)) throw err;
      walked = await walkFolder(token, startUrl(folder, since));
    }
    cursors[folder] = walked.next;
    found.push(...walked.messages.map((m) => ({ ...m, _folder: folder })));
  }

  if (found.length > 0) {
    const { data: accounts, error: accountsError } = await db.from("email_accounts").select("id, address, mailbox");
    if (accountsError) throw accountsError;
    const own = new Set(accounts.map((a) => a.address.toLowerCase()));
    const box = account.address.toLowerCase();
    // This mailbox and its alias rows: a message files under the alias it was sent from or to.
    const aliases = new Map(accounts.filter((a) => a.address.toLowerCase() === box || a.mailbox?.toLowerCase() === box).map((a) => [a.address.toLowerCase(), a.id]));

    const threads = [...new Set(found.map((m) => m.conversationId).filter((t): t is string => Boolean(t)))];
    const byThread = new Map<string, string>();
    for (const r of await inChunks(threads, async (chunk) => {
      // Mail with no lead shares threads too; only rows with a lead say whose thread it is.
      const { data, error } = await db.from("email_messages").select("lead_id, provider_thread_id").in("provider_thread_id", chunk).not("lead_id", "is", null);
      if (error) throw error;
      return data;
    })) {
      if (r.provider_thread_id && r.lead_id) byThread.set(r.provider_thread_id, r.lead_id);
    }

    const emails = [...new Set(found.flatMap((m) => [address(m.from), ...addresses(m.toRecipients)]).filter((e) => e && !own.has(e)))];
    const byEmail = new Map<string, string>();
    for (const l of await inChunks(emails, async (chunk) => {
      const { data, error } = await db.from("leads").select("id, email").in("email", chunk);
      if (error) throw error;
      return data;
    })) {
      if (l.email) byEmail.set(l.email.toLowerCase(), l.id);
    }

    const headers = found.map((m) => m.internetMessageId).filter((h): h is string => Boolean(h));
    const known = new Set(
      (
        await inChunks(headers, async (chunk) => {
          const { data, error } = await db.from("email_messages").select("message_id_header").in("message_id_header", chunk);
          if (error) throw error;
          return data;
        })
      ).map((r) => r.message_id_header),
    );

    // Oldest first across both folders, so the lead triggers see a conversation in order.
    found.sort((a, b) => (a.receivedDateTime ?? "").localeCompare(b.receivedDateTime ?? ""));
    for (const m of found) {
      const sender = address(m.from);
      const to = addresses(m.toRecipients);
      const cc = addresses(m.ccRecipients);
      const outbound = own.has(sender);
      const other = outbound ? (to.find((r) => !own.has(r)) ?? "") : sender;
      const leadId = byThread.get(m.conversationId ?? "") ?? byEmail.get(other) ?? null;

      if (m.internetMessageId && known.has(m.internetMessageId)) {
        // The CRM's own sends: stored already; add the ids Outlook gave them.
        await db
          .from("email_messages")
          .update({ provider_message_id: m.id, provider_thread_id: m.conversationId ?? null })
          .eq("message_id_header", m.internetMessageId)
          .is("provider_message_id", null);
        continue;
      }

      const accountId = (outbound ? [sender] : [...to, ...cc]).map((a) => aliases.get(a)).find(Boolean) ?? account.id;
      const text = m.body?.content ?? "";
      const { error } = await db.from("email_messages").upsert(
        {
          lead_id: leadId,
          account_id: accountId,
          direction: outbound ? "out" : "in",
          folder: FOLDERS[m._folder ?? ""] ?? (outbound ? "sent" : "inbox"),
          from_address: sender,
          from_name: displayName(m.from),
          to_address: to.join(", "),
          cc_address: cc.join(", "),
          subject: m.subject ?? "",
          body_text: outbound ? text.trim() : replyText(text),
          provider: "outlook",
          provider_message_id: m.id,
          provider_thread_id: m.conversationId ?? null,
          conversation_id: m.conversationId ?? null,
          message_id_header: m.internetMessageId ?? null,
          status: outbound ? "sent" : "received",
          sent_by: outbound ? "outlook" : null,
          // Lead mail stays unread until opened in the CRM (it drives "waiting on us"); other mail
          // mirrors Outlook, so what Max already read there isn't new here.
          read_at: !outbound && !leadId && m.isRead ? (m.receivedDateTime ?? null) : null,
          attachments: m.hasAttachments ? await attachmentMeta(token, m.id) : [],
          created_at: m.receivedDateTime,
        },
        { onConflict: "provider,provider_message_id", ignoreDuplicates: true },
      );
      if (error) throw error;
    }
  }

  const { error } = await db.from("email_accounts").update({ sync_cursor: JSON.stringify(cursors) }).eq("id", account.id);
  if (error) throw error;
  return found.length;
}

/**
 * Sync the app-only mailbox if the last sync was at least `minGapMs` ago. Returns how many changed
 * messages Outlook handed over, or null when it didn't run. Never throws: a page load must not fail
 * because Outlook had a bad moment.
 */
export async function syncOutlookIfDue(minGapMs: number = MIN_GAP_MS): Promise<number | null> {
  if (!outlookAppOnly()) return null;
  const db = createServiceRoleClient();
  if (!db) return null;
  try {
    const { data: beat } = await db.from("worker_heartbeats").select("beat_at").eq("name", HEARTBEAT).maybeSingle();
    if (beat && Date.now() - new Date(beat.beat_at).getTime() < minGapMs) return null;
    // Claim the slot before the slow part, so a burst of page loads runs one sync, not ten.
    await db.from("worker_heartbeats").upsert({ name: HEARTBEAT, beat_at: new Date().toISOString(), detail: { started: true } });

    const { data: boxes, error } = await db
      .from("email_accounts")
      .select("id, address, sync_cursor")
      .eq("provider", "outlook")
      .is("mailbox", null)
      .ilike("address", emailConfig.msAppMailbox);
    if (error) throw error;
    let seen = 0;
    for (const box of boxes) seen += await syncMailbox(db, box);
    await db.from("worker_heartbeats").upsert({ name: HEARTBEAT, beat_at: new Date().toISOString(), detail: { every_s: MIN_GAP_MS / 1000, last_pass: { seen } } });
    return seen;
  } catch (err) {
    console.error("[outlook-sync] failed:", err instanceof Error ? err.message : err);
    return null;
  }
}
