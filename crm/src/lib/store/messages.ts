import { getStoreClient, type StoreClient } from "./db";

export type MessageDirection = "out" | "in";

export interface EmailMessage {
  id: string;
  leadId: string;
  accountId: string | null;
  direction: MessageDirection;
  fromAddress: string;
  toAddress: string;
  subject: string;
  bodyText: string;
  provider: "resend" | "gmail";
  status: "sent" | "failed" | "received";
  error: string | null;
  sentBy: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface EmailAccount {
  id: string;
  provider: "resend" | "gmail";
  address: string;
  displayName: string;
  connectedBy: string;
  status: "active" | "needs_reconnect" | "disabled";
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
  "id, lead_id, account_id, direction, from_address, to_address, subject, body_text, provider, status, error, sent_by, read_at, created_at";

interface MessageRow {
  id: string;
  lead_id: string;
  account_id: string | null;
  direction: string;
  from_address: string;
  to_address: string;
  subject: string;
  body_text: string;
  provider: string;
  status: string;
  error: string | null;
  sent_by: string | null;
  read_at: string | null;
  created_at: string;
}

function rowToMessage(r: MessageRow): EmailMessage {
  return {
    id: r.id,
    leadId: r.lead_id,
    accountId: r.account_id,
    direction: r.direction as MessageDirection,
    fromAddress: r.from_address,
    toAddress: r.to_address,
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
    .select("id, provider, address, display_name, connected_by, status")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data.map((a) => ({
    id: a.id,
    provider: a.provider as EmailAccount["provider"],
    address: a.address,
    displayName: a.display_name,
    connectedBy: a.connected_by,
    status: a.status as EmailAccount["status"],
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
    .is("read_at", null);
  if (error) return 0;
  return count ?? 0;
}
