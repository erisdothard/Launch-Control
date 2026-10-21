import { outlookAppOnly } from "@/lib/email/config";
import { getStoreClient, type StoreClient } from "./db";

export type MessageDirection = "out" | "in";

/** A file on a stored email: uploaded by the CRM (path in the bucket) or synced from Outlook (providerId). */
export interface StoredAttachment {
  name: string;
  size: number;
  type: string;
  path?: string;
  providerId?: string;
}

export type MailFolder = "inbox" | "sent" | "archive";

export interface EmailMessage {
  id: string;
  /** Null for mail from someone who isn't a lead. */
  leadId: string | null;
  accountId: string | null;
  direction: MessageDirection;
  folder: MailFolder;
  conversationId: string | null;
  fromAddress: string;
  fromName: string;
  toAddress: string;
  ccAddress: string;
  attachments: StoredAttachment[];
  subject: string;
  bodyText: string;
  provider: "resend" | "gmail" | "outlook";
  status: "sent" | "failed" | "received";
  error: string | null;
  sentBy: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface EmailAccount {
  id: string;
  provider: "resend" | "gmail" | "outlook";
  address: string;
  displayName: string; // the From name, e.g. "Launch Control"
  signatureName: string; // who signs, e.g. "Maxwell Hartmann"
  signatureTitle: string;
  signaturePhone: string;
  connectedBy: string;
  status: "active" | "needs_reconnect" | "disabled";
  mailbox: string | null; // Outlook alias rows: the mailbox they belong to
  lastError: string | null; // why it stopped sending or syncing, as the provider said it
  lastErrorAt: string | null;
}

export interface InboxRow {
  leadId: string;
  businessName: string;
  contactName: string | null;
  lastDirection: MessageDirection;
  lastSubject: string;
  lastSnippet: string;
  lastAt: string;
  unread: number;
}

const MESSAGE_COLUMNS =
  "id, lead_id, account_id, direction, folder, conversation_id, from_address, from_name, to_address, cc_address, attachments, subject, body_text, provider, status, error, sent_by, read_at, created_at";

interface MessageRow {
  id: string;
  lead_id: string | null;
  account_id: string | null;
  direction: string;
  folder: string;
  conversation_id: string | null;
  from_address: string;
  from_name: string;
  to_address: string;
  cc_address: string;
  attachments: unknown;
  subject: string;
  body_text: string;
  provider: string;
  status: string;
  error: string | null;
  sent_by: string | null;
  read_at: string | null;
  created_at: string;
}

function parseAttachments(raw: unknown): StoredAttachment[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((a): a is Record<string, unknown> => typeof a === "object" && a !== null && typeof (a as { name?: unknown }).name === "string")
    .map((a) => ({
      name: String(a.name),
      size: Number(a.size) || 0,
      type: typeof a.type === "string" ? a.type : "application/octet-stream",
      ...(typeof a.path === "string" && { path: a.path }),
      ...(typeof a.provider_id === "string" && { providerId: a.provider_id }),
    }));
}

function rowToMessage(r: MessageRow): EmailMessage {
  return {
    id: r.id,
    leadId: r.lead_id,
    accountId: r.account_id,
    direction: r.direction as MessageDirection,
    folder: (r.folder as MailFolder) ?? "inbox",
    conversationId: r.conversation_id,
    fromAddress: r.from_address,
    fromName: r.from_name ?? "",
    toAddress: r.to_address,
    ccAddress: r.cc_address ?? "",
    attachments: parseAttachments(r.attachments),
    subject: r.subject,
    bodyText: r.body_text,
    provider: r.provider as EmailMessage["provider"],
    status: r.status as EmailMessage["status"],
    error: r.error,
    sentBy: r.sent_by,
    readAt: r.read_at,
    createdAt: r.created_at,
  };
}

export async function getThread(leadId: string, client?: StoreClient): Promise<EmailMessage[]> {
  const supabase = await getStoreClient(client);
  const { data, error } = await supabase
    .from("email_messages")
    .select(MESSAGE_COLUMNS)
    .eq("lead_id", leadId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data as MessageRow[]).map(rowToMessage);
}

export async function markThreadRead(leadId: string, client?: StoreClient): Promise<void> {
  const supabase = await getStoreClient(client);
  const { error } = await supabase
    .from("email_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("lead_id", leadId)
    .eq("direction", "in")
    .is("read_at", null);
  if (error) throw error;
}

export async function getEmailAccounts(client?: StoreClient): Promise<EmailAccount[]> {
  const supabase = await getStoreClient(client);
  const { data, error } = await supabase
    .from("email_accounts")
    .select("id, provider, address, display_name, signature_name, signature_title, signature_phone, connected_by, status, mailbox, last_error, last_error_at")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data.map((a) => ({
    id: a.id,
    provider: a.provider as EmailAccount["provider"],
    address: a.address,
    displayName: a.display_name,
    signatureName: a.signature_name,
    signatureTitle: a.signature_title,
    signaturePhone: a.signature_phone ?? "",
    connectedBy: a.connected_by,
    // App-only Outlook doesn't depend on a user sign-in, so an old "needs_reconnect" doesn't apply.
    status: (a.provider === "outlook" && a.status === "needs_reconnect" && outlookAppOnly() ? "active" : a.status) as EmailAccount["status"],
    mailbox: a.mailbox,
    lastError: a.last_error ?? null,
    lastErrorAt: a.last_error_at ?? null,
  }));
}

export async function getInbox(limit = 100, client?: StoreClient): Promise<InboxRow[]> {
  const supabase = await getStoreClient(client);
  const { data, error } = await supabase
    .from("email_inbox")
    .select("*")
    .order("last_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data.map((r) => ({
    leadId: r.lead_id ?? "",
    businessName: r.business_name ?? "",
    contactName: r.contact_name,
    lastDirection: (r.last_direction ?? "out") as MessageDirection,
    lastSubject: r.last_subject ?? "",
    lastSnippet: r.last_snippet ?? "",
    lastAt: r.last_at ?? "",
    unread: Number(r.unread ?? 0),
  }));
}

export async function getUnreadCount(client?: StoreClient): Promise<number> {
  const supabase = await getStoreClient(client);
  const { count, error } = await supabase
    .from("email_messages")
    .select("id", { count: "exact", head: true })
    .eq("direction", "in")
    .eq("folder", "inbox")
    .is("read_at", null);
  if (error) return 0;
  return count ?? 0;
}

// ---- Inbox (v2): the whole mailbox, grouped into conversations ---------------------------------

export type InboxFolder = "inbox" | "needs" | "drafts" | "sent" | "archive";

/** One conversation in the thread list. */
export interface ThreadSummary {
  key: string;
  leadId: string | null;
  businessName: string | null;
  contactName: string | null;
  /** The other side: who wrote to us, or who we wrote to. */
  name: string;
  address: string;
  subject: string;
  snippet: string;
  lastAt: string;
  lastDirection: MessageDirection;
  unread: number;
  count: number;
  hasAttachments: boolean;
}

export interface InboxCounts {
  unread: number;
  needsReply: number;
}

export interface InboxPage {
  threads: ThreadSummary[];
  counts: InboxCounts;
  hasMore: boolean;
}

export interface ThreadLead {
  id: string;
  businessName: string;
  contactName: string | null;
  email: string;
  status: string;
}

export interface ContactMatch {
  leadId: string;
  name: string;
  businessName: string;
  email: string;
}

const PAGE_SIZE = 50;
// How far back the list looks; grouping happens in code because a thread's place depends on all
// of its messages (an Inbox thread stays in the Inbox after we answer it).
const SCAN_LIMIT = 1500;
const LIGHT_COLUMNS = "id, conversation_id, lead_id, folder, direction, read_at, created_at, from_name, from_address, to_address, subject, attachments";

interface LightRow {
  id: string;
  conversation_id: string | null;
  lead_id: string | null;
  folder: string;
  direction: string;
  read_at: string | null;
  created_at: string;
  from_name: string;
  from_address: string;
  to_address: string;
  subject: string;
  attachments: unknown;
}

/** Same key as the email_threads view: conversation, else lead, else the message itself. */
export function threadKeyOf(r: { id: string; conversation_id: string | null; lead_id: string | null }): string {
  return r.conversation_id ?? (r.lead_id ? `lead:${r.lead_id}` : `msg:${r.id}`);
}

/** Commas, parentheses and quotes are PostgREST filter syntax; keep words, @ and dots. */
export function cleanSearch(q: string): string {
  return q.replace(/[,()"'*%\\:]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

interface Grouped {
  key: string;
  rows: LightRow[];
}

function group(rows: LightRow[]): Grouped[] {
  const map = new Map<string, LightRow[]>();
  for (const r of rows) {
    const key = threadKeyOf(r);
    const list = map.get(key);
    if (list) list.push(r);
    else map.set(key, [r]);
  }
  // Rows arrive newest first, so insertion order is newest-thread first.
  return [...map.entries()].map(([key, list]) => ({ key, rows: list }));
}

const unreadIn = (g: Grouped) => g.rows.filter((r) => r.direction === "in" && !r.read_at && r.folder !== "archive").length;
const inInbox = (g: Grouped) => g.rows.some((r) => r.folder === "inbox");
// Waiting on us: their message is the last word and either nobody has opened it or it's a lead's.
const needsReply = (g: Grouped) => inInbox(g) && g.rows[0].direction === "in" && (unreadIn(g) > 0 || g.rows.some((r) => r.lead_id));

// PostgREST returns at most 1000 rows a request, so the scan reads in pages of this size.
const SCAN_PAGE = 1000;

async function scan(supabase: StoreClient, folders: MailFolder[], q: string): Promise<LightRow[]> {
  const term = cleanSearch(q);
  const out: LightRow[] = [];
  for (let from = 0; from < SCAN_LIMIT; from += SCAN_PAGE) {
    // A failed send stays on its conversation (marked failed) but never makes a thread or shows in Sent.
    let query = supabase.from("email_messages").select(LIGHT_COLUMNS).in("folder", folders).neq("status", "failed");
    if (term) {
      const like = `"*${term}*"`;
      query = query.or(
        `subject.ilike.${like},from_name.ilike.${like},from_address.ilike.${like},to_address.ilike.${like},body_text.ilike.${like}`
      );
    }
    const to = Math.min(from + SCAN_PAGE, SCAN_LIMIT) - 1;
    const { data, error } = await query.order("created_at", { ascending: false }).order("id", { ascending: false }).range(from, to);
    if (error) throw error;
    out.push(...(data as LightRow[]));
    if (data.length < to - from + 1) break;
  }
  return out;
}

function countsOf(groups: Grouped[]): InboxCounts {
  return {
    unread: groups.filter((g) => inInbox(g) && unreadIn(g) > 0).length,
    needsReply: groups.filter(needsReply).length,
  };
}

/** Unread conversations in the Inbox and conversations waiting on a reply. */
export async function getInboxCounts(client?: StoreClient): Promise<InboxCounts> {
  const supabase = await getStoreClient(client);
  return countsOf(group(await scan(supabase, ["inbox", "sent"], "")));
}

/** One page of a folder's conversations, newest first, plus the folder counts. Drafts live in drafts.ts. */
export async function getInboxPage(
  folder: Exclude<InboxFolder, "drafts">,
  opts: { q?: string; page?: number } = {},
  client?: StoreClient
): Promise<InboxPage> {
  const supabase = await getStoreClient(client);
  const q = opts.q ?? "";
  const page = Math.max(0, opts.page ?? 0);
  const live = await scan(supabase, ["inbox", "sent"], "");
  const liveGroups = group(live);
  const counts = countsOf(liveGroups);

  let groups: Grouped[];
  if (folder === "archive") groups = group(await scan(supabase, ["archive"], q));
  else {
    const source = q ? group(await scan(supabase, ["inbox", "sent"], q)) : liveGroups;
    groups =
      folder === "inbox"
        ? source.filter(inInbox)
        : folder === "needs"
          ? source.filter(needsReply)
          : source.filter((g) => g.rows.some((r) => r.folder === "sent"));
  }

  const slice = groups.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const latestIds = slice.map((g) => g.rows[0].id);
  const leadIds = [...new Set(slice.map((g) => g.rows.find((r) => r.lead_id)?.lead_id).filter((x): x is string => Boolean(x)))];
  const [bodies, leads] = await Promise.all([
    latestIds.length ? supabase.from("email_messages").select("id, body_text").in("id", latestIds) : Promise.resolve({ data: [], error: null }),
    leadIds.length ? supabase.from("leads").select("id, business_name, contact_name").in("id", leadIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (bodies.error) throw bodies.error;
  if (leads.error) throw leads.error;
  const bodyById = new Map((bodies.data ?? []).map((b) => [b.id, b.body_text]));
  const leadById = new Map((leads.data ?? []).map((l) => [l.id, l]));

  const threads = slice.map((g): ThreadSummary => {
    const last = g.rows[0];
    const theirs = g.rows.find((r) => r.direction === "in");
    const leadId = g.rows.find((r) => r.lead_id)?.lead_id ?? null;
    const lead = leadId ? leadById.get(leadId) : undefined;
    const address = theirs?.from_address ?? (last.to_address.split(",")[0] ?? "").trim();
    return {
      key: g.key,
      leadId,
      businessName: lead?.business_name ?? null,
      contactName: lead?.contact_name ?? null,
      name: theirs?.from_name || lead?.contact_name || address,
      address,
      subject: last.subject,
      snippet: (bodyById.get(last.id) ?? "").replace(/\s+/g, " ").trim().slice(0, 220),
      lastAt: last.created_at,
      lastDirection: last.direction as MessageDirection,
      unread: unreadIn(g),
      count: g.rows.length,
      hasAttachments: g.rows.some((r) => parseAttachments(r.attachments).length > 0),
    };
  });
  return { threads, counts, hasMore: groups.length > (page + 1) * PAGE_SIZE };
}

// The filter that selects one conversation's messages, from its key.
function byKey<T extends { eq: (c: string, v: string) => T; is: (c: string, v: null) => T }>(query: T, key: string): T {
  if (key.startsWith("lead:")) return query.eq("lead_id", key.slice(5)).is("conversation_id", null);
  if (key.startsWith("msg:")) return query.eq("id", key.slice(4));
  return query.eq("conversation_id", key);
}

/** Every message in one conversation, oldest first. */
export async function getConversation(key: string, client?: StoreClient): Promise<EmailMessage[]> {
  const supabase = await getStoreClient(client);
  const { data, error } = await byKey(supabase.from("email_messages").select(MESSAGE_COLUMNS), key)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) throw error;
  return (data as MessageRow[]).map(rowToMessage);
}

export async function getThreadLead(leadId: string, client?: StoreClient): Promise<ThreadLead | null> {
  const supabase = await getStoreClient(client);
  const { data, error } = await supabase.from("leads").select("id, business_name, contact_name, email, status").eq("id", leadId).maybeSingle();
  if (error) throw error;
  return data ? { id: data.id, businessName: data.business_name, contactName: data.contact_name, email: data.email, status: data.status } : null;
}

/** Read marks only touch what they sent us. */
export async function setConversationRead(key: string, read: boolean, client?: StoreClient): Promise<void> {
  const supabase = await getStoreClient(client);
  const base = supabase.from("email_messages").update({ read_at: read ? new Date().toISOString() : null }).eq("direction", "in");
  const { error } = await byKey(read ? base.is("read_at", null) : base, key);
  if (error) throw error;
}

/** Archive files every message of the conversation away; restoring puts theirs in Inbox and ours in Sent. */
export async function setConversationArchived(key: string, archived: boolean, client?: StoreClient): Promise<void> {
  const supabase = await getStoreClient(client);
  if (archived) {
    const { error } = await byKey(supabase.from("email_messages").update({ folder: "archive" }), key);
    if (error) throw error;
    return;
  }
  for (const [direction, folder] of [
    ["in", "inbox"],
    ["out", "sent"],
  ] as const) {
    const { error } = await byKey(supabase.from("email_messages").update({ folder }).eq("folder", "archive").eq("direction", direction), key);
    if (error) throw error;
  }
}

/** Ties a conversation, and any other unlinked mail to or from exactly that address, to a lead. */
export async function linkConversationToLead(key: string, leadId: string, address: string, client?: StoreClient): Promise<void> {
  const supabase = await getStoreClient(client);
  const { error } = await byKey(supabase.from("email_messages").update({ lead_id: leadId }).is("lead_id", null), key);
  if (error) throw error;
  const clean = address.trim().toLowerCase();
  if (!clean) return;
  // .eq is a parameter, never a pattern: no wildcard can widen what gets linked.
  for (const column of ["from_address", "to_address"] as const) {
    const { error: more } = await supabase.from("email_messages").update({ lead_id: leadId }).is("lead_id", null).eq(column, clean);
    if (more) throw more;
  }
}

/** The lead with exactly this email (case-insensitive, wildcards escaped), if any. */
export async function findLeadIdByEmail(address: string, client?: StoreClient): Promise<string | null> {
  const supabase = await getStoreClient(client);
  const term = address.trim().replace(/[%_\\]/g, (c) => `\\${c}`);
  const { data, error } = await supabase.from("leads").select("id").ilike("email", term).limit(1);
  if (error) throw error;
  return data?.[0]?.id ?? null;
}

/** Leads whose name, business or email matches, for the composer's To field. */
export async function searchContacts(q: string, client?: StoreClient): Promise<ContactMatch[]> {
  const term = cleanSearch(q);
  if (term.length < 2) return [];
  const supabase = await getStoreClient(client);
  const like = `"*${term}*"`;
  const { data, error } = await supabase
    .from("leads")
    .select("id, business_name, contact_name, email")
    .neq("email", "")
    .or(`business_name.ilike.${like},contact_name.ilike.${like},email.ilike.${like}`)
    .order("updated_at", { ascending: false })
    .limit(8);
  if (error) throw error;
  return data.map((l) => ({ leadId: l.id, name: l.contact_name ?? "", businessName: l.business_name, email: l.email }));
}

/** One attachment of a message, with what's needed to fetch it from Outlook. RLS applies. */
export async function getMessageAttachment(
  messageId: string,
  index: number,
  client?: StoreClient
): Promise<{ attachment: StoredAttachment; accountId: string | null; providerMessageId: string | null } | null> {
  const supabase = await getStoreClient(client);
  const { data, error } = await supabase.from("email_messages").select("attachments, account_id, provider_message_id").eq("id", messageId).maybeSingle();
  if (error || !data) return null;
  const attachment = parseAttachments(data.attachments)[index];
  return attachment ? { attachment, accountId: data.account_id, providerMessageId: data.provider_message_id } : null;
}
