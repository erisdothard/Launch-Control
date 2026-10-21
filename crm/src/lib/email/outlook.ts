import "server-only";
import { randomUUID } from "node:crypto";
import nodemailer from "nodemailer";
import { emailConfig, outlookAppOnly } from "./config";

// Microsoft 365 through Microsoft Graph. The app registration ("Launch Control CRM") lives in the
// team's own tenant and is admin-consented, so "Connect Outlook" is a single sign-in.

export const OUTLOOK_SCOPES = [
  "openid",
  "email",
  "profile",
  "offline_access",
  "https://graph.microsoft.com/User.Read",
  "https://graph.microsoft.com/Mail.Send",
  "https://graph.microsoft.com/Mail.ReadWrite",
  "https://graph.microsoft.com/Calendars.ReadWrite",
  "https://graph.microsoft.com/MailboxSettings.Read",
];

// Mail goes out over SMTP AUTH (XOAUTH2), not Graph: Exchange rejects Graph-submitted mail from a
// new tenant with 550 5.7.708, while client submission delivers. Graph still reads mail and calendar.
export const SMTP_SCOPES = ["offline_access", "https://outlook.office365.com/SMTP.Send"];
export type TokenResource = "graph" | "smtp";

const GRAPH = "https://graph.microsoft.com/v1.0";
const authority = () => `https://login.microsoftonline.com/${emailConfig.msTenantId}/oauth2/v2.0`;

export function outlookAuthUrl(state: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: emailConfig.msClientId,
    redirect_uri: redirectUri,
    response_type: "code",
    response_mode: "query",
    scope: OUTLOOK_SCOPES.join(" "),
    prompt: "select_account",
    state,
  });
  return `${authority()}/authorize?${params}`;
}

export interface OutlookTokens {
  access_token: string;
  refresh_token?: string;
}

export class OutlookReconnectNeeded extends Error {
  /** Microsoft's own reason, e.g. "AADSTS50076: ... multi-factor authentication ...". */
  readonly reason: string;
  constructor(reason = "") {
    super("This Outlook connection expired. Reconnect it in Settings.");
    this.reason = reason;
  }
}

async function tokenRequest(params: Record<string, string>, resource: TokenResource = "graph"): Promise<OutlookTokens> {
  const res = await fetch(`${authority()}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: emailConfig.msClientId,
      client_secret: emailConfig.msClientSecret,
      scope: (resource === "smtp" ? SMTP_SCOPES : OUTLOOK_SCOPES).join(" "),
      ...params,
    }),
    cache: "no-store",
  });
  const body = (await res.json()) as OutlookTokens & { error?: string; error_description?: string };
  if (body.error === "invalid_grant") throw new OutlookReconnectNeeded(body.error_description?.split("\r\n")[0] ?? "");
  if (!res.ok) throw new Error(`Microsoft token ${res.status}: ${body.error_description?.split("\r\n")[0] ?? body.error ?? "failed"}`);
  return body;
}

export function exchangeOutlookCode(code: string, redirectUri: string) {
  return tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri });
}

/** New access token; the returned refresh token replaces the stored one (Microsoft rotates them). */
export function refreshOutlook(refreshToken: string, resource: TokenResource = "graph") {
  return tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken }, resource);
}

// App-only tokens (client credentials), cached per resource until a minute before they expire.
const appTokens = new Map<TokenResource, { token: string; expiresAt: number }>();

export async function appOnlyToken(resource: TokenResource = "graph"): Promise<string> {
  const cached = appTokens.get(resource);
  if (cached && cached.expiresAt > Date.now()) return cached.token;
  const res = await fetch(`${authority()}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: emailConfig.msClientId,
      client_secret: emailConfig.msClientSecret,
      grant_type: "client_credentials",
      scope: resource === "smtp" ? "https://outlook.office365.com/.default" : "https://graph.microsoft.com/.default",
    }),
    cache: "no-store",
  });
  const body = (await res.json()) as { access_token?: string; expires_in?: number; error?: string; error_description?: string };
  if (!res.ok || !body.access_token) {
    throw new Error(`Microsoft app sign-in failed: ${body.error_description?.split("\r\n")[0] ?? body.error ?? res.status}`);
  }
  appTokens.set(resource, { token: body.access_token, expiresAt: Date.now() + ((body.expires_in ?? 3600) - 60) * 1000 });
  return body.access_token;
}

/** "/me/..." as a signed-in user; "/users/<mailbox>/..." when the app works on the mailbox itself. */
export function graphPath(path: string): string {
  if (!outlookAppOnly() || !/^\/me(\/|\?|$)/.test(path)) return path;
  return `/users/${encodeURIComponent(emailConfig.msAppMailbox)}${path.slice(3)}`;
}

export function graphUrl(path: string): string {
  return `${GRAPH}${graphPath(path)}`;
}

export interface SmtpSend {
  fromName: string;
  fromAddress: string;
  mailbox: string;
  to: string;
  subject: string;
  text: string;
  html: string | null;
  cc?: string[];
  bcc?: string[];
  attachments?: OutboundFile[];
  /** RFC 5322 Message-ID of the message being answered, so the send threads under it. */
  inReplyTo?: string | null;
  /** The answered message's own References chain plus its id; defaults to inReplyTo. */
  references?: string | null;
}

/** A file going out with an email, already read into memory. */
export interface OutboundFile {
  filename: string;
  content: Buffer;
  contentType: string;
}

/** Sends through smtp.office365.com as the mailbox; Exchange files a copy in Sent Items. */
export async function sendViaOutlookSmtp(accessToken: string, msg: SmtpSend): Promise<{ messageId: string }> {
  const transport = nodemailer.createTransport({
    host: "smtp.office365.com",
    port: 587,
    secure: false,
    requireTLS: true,
    auth: { type: "OAuth2", user: msg.mailbox, accessToken },
    connectionTimeout: 15_000,
    socketTimeout: 30_000,
  });
  const messageId = `<${randomUUID()}@${msg.mailbox.split("@")[1]}>`;
  try {
    await transport.sendMail({
      from: { name: msg.fromName, address: msg.fromAddress },
      to: msg.to,
      cc: msg.cc?.length ? msg.cc : undefined,
      bcc: msg.bcc?.length ? msg.bcc : undefined,
      subject: msg.subject,
      text: msg.text,
      html: msg.html ?? undefined,
      attachments: msg.attachments?.map((a) => ({ filename: a.filename, content: a.content, contentType: a.contentType })),
      messageId,
      inReplyTo: msg.inReplyTo ?? undefined,
      references: msg.references ?? msg.inReplyTo ?? undefined,
    });
  } finally {
    transport.close();
  }
  return { messageId };
}

export async function graph<T>(accessToken: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(graphUrl(path), {
    ...init,
    // Immutable ids: a message keeps its id when someone files it into another folder in Outlook.
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", Prefer: 'IdType="ImmutableId"', ...init?.headers },
    cache: "no-store",
  });
  if (res.status === 202 || res.status === 204) return {} as T;
  const body = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok) throw new Error(`Outlook ${res.status}: ${body.error?.message ?? "request failed"}`);
  return body;
}

/** The mailbox address and every alias on it (proxyAddresses, smtp: entries on custom domains). */
export async function outlookIdentity(accessToken: string): Promise<{ mailbox: string; aliases: string[]; name: string }> {
  const me = await graph<{ mail: string | null; userPrincipalName: string; displayName: string; proxyAddresses?: string[] }>(
    accessToken,
    "/me?$select=mail,userPrincipalName,displayName,proxyAddresses"
  );
  const mailbox = (me.mail ?? me.userPrincipalName).toLowerCase();
  const aliases = (me.proxyAddresses ?? [])
    .filter((p) => /^smtp:/i.test(p))
    .map((p) => p.slice(5).toLowerCase())
    .filter((a) => a !== mailbox && !a.endsWith(".onmicrosoft.com"));
  return { mailbox, aliases: [...new Set(aliases)], name: me.displayName };
}

export interface OutlookSend {
  fromName: string;
  fromAddress: string;
  mailbox: string;
  to: string;
  subject: string;
  html: string;
  /** Graph id of the lead's last message in this mailbox; the send becomes a reply to it. */
  replyToMessageId?: string | null;
}

interface GraphMessage {
  id: string;
  conversationId: string;
  internetMessageId: string;
}

/**
 * Sends from the shared mailbox (or one of its aliases) and returns the ids the worker matches
 * replies on. Drafted first so the ids are known; replies go through createReply so Outlook threads
 * them with the original.
 */
export async function sendViaOutlook(accessToken: string, msg: OutlookSend): Promise<GraphMessage> {
  const from = msg.fromAddress.toLowerCase() === msg.mailbox.toLowerCase() ? undefined : { emailAddress: { name: msg.fromName || undefined, address: msg.fromAddress } };
  const fields = {
    subject: msg.subject,
    body: { contentType: "HTML", content: msg.html },
    toRecipients: [{ emailAddress: { address: msg.to } }],
    ...(from && { from }),
  };
  let draft: GraphMessage | null = null;
  if (msg.replyToMessageId) {
    // The original may have been deleted in Outlook; then send it as a new message instead.
    draft = await graph<GraphMessage>(accessToken, `/me/messages/${encodeURIComponent(msg.replyToMessageId)}/createReply`, { method: "POST", body: "{}" }).catch(() => null);
    if (draft) await graph(accessToken, `/me/messages/${encodeURIComponent(draft.id)}`, { method: "PATCH", body: JSON.stringify(fields) });
  }
  draft ??= await graph<GraphMessage>(accessToken, "/me/messages", { method: "POST", body: JSON.stringify(fields) });
  await graph(accessToken, `/me/messages/${encodeURIComponent(draft.id)}/send`, { method: "POST", body: "{}" });
  return draft;
}

// ---- Calendar -------------------------------------------------------------------------------

export interface OutlookEvent {
  id: string;
  subject: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  isAllDay: boolean;
  location?: { displayName?: string };
  bodyPreview?: string;
  webLink?: string;
  organizer?: { emailAddress?: { name?: string; address?: string } };
}

export interface EventFields {
  title: string;
  startsAt: string; // ISO
  endsAt: string;
  allDay: boolean;
  location: string;
  notes: string;
}

// Graph takes UTC wall time with timeZone "UTC"; all-day events must sit on midnight boundaries in
// the event's own zone, so they're sent in the browser-chosen zone the CRM stored them in.
function eventBody(e: EventFields, timeZone: string) {
  const wall = (iso: string) => {
    if (!e.allDay) return { dateTime: iso.replace(/Z$/, ""), timeZone: "UTC" };
    const d = new Date(iso);
    const local = new Date(d.toLocaleString("en-US", { timeZone }));
    const pad = (n: number) => String(n).padStart(2, "0");
    return { dateTime: `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}T00:00:00`, timeZone };
  };
  return {
    subject: e.title,
    start: wall(e.startsAt),
    end: wall(e.endsAt),
    isAllDay: e.allDay,
    location: { displayName: e.location },
    body: { contentType: "Text", content: e.notes },
  };
}

export function createOutlookEvent(accessToken: string, e: EventFields, timeZone: string) {
  return graph<{ id: string }>(accessToken, "/me/events", { method: "POST", body: JSON.stringify(eventBody(e, timeZone)) });
}

export function updateOutlookEvent(accessToken: string, id: string, e: EventFields, timeZone: string) {
  return graph<{ id: string }>(accessToken, `/me/events/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(eventBody(e, timeZone)) });
}

export function deleteOutlookEvent(accessToken: string, id: string) {
  return graph(accessToken, `/me/events/${encodeURIComponent(id)}`, { method: "DELETE" });
}

/** Events in [from, to), times in UTC. */
export async function outlookCalendarView(accessToken: string, from: string, to: string): Promise<OutlookEvent[]> {
  const params = new URLSearchParams({
    startDateTime: from,
    endDateTime: to,
    $select: "id,subject,start,end,isAllDay,location,bodyPreview,webLink,organizer",
    $orderby: "start/dateTime",
    $top: "250",
  });
  const body = await graph<{ value: OutlookEvent[] }>(accessToken, `/me/calendarView?${params}`, {
    headers: { Prefer: 'outlook.timezone="UTC", IdType="ImmutableId"' },
  });
  return body.value;
}
