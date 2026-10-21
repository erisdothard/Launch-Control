import "server-only";
import { randomUUID } from "node:crypto";
import { emailConfig } from "./config";
import type { OutboundFile } from "./outlook";
import { messageIdHeader } from "./text";

export const GMAIL_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
];

export function googleAuthUrl(state: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: emailConfig.googleClientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GMAIL_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  error?: string;
  error_description?: string;
}

async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: emailConfig.googleClientId,
      client_secret: emailConfig.googleClientSecret,
      ...params,
    }),
    cache: "no-store",
  });
  const body = (await res.json()) as TokenResponse;
  if (!res.ok) throw new Error(`Google token ${res.status}: ${body.error_description ?? body.error ?? "failed"}`);
  return body;
}

export function exchangeCode(code: string, redirectUri: string) {
  return tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri });
}

export async function accessTokenFor(refreshToken: string): Promise<string> {
  return (await tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken })).access_token;
}

async function gmailFetch<T>(accessToken: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  const body = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok) throw new Error(`Gmail ${res.status}: ${body.error?.message ?? "request failed"}`);
  return body;
}

export function gmailProfile(accessToken: string) {
  return gmailFetch<{ emailAddress: string; historyId: string }>(accessToken, "/profile");
}

function encodeHeader(value: string): string {
  // RFC 2047 for anything outside printable ASCII (names and subjects with accents, emoji).
  return /^[\x20-\x7e]*$/.test(value) ? value : `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

/** "Name <a@b.com>" with only the name encoded, so the address stays readable to servers. */
function encodeAddress(value: string): string {
  const match = /^(.*)<([^>]+)>$/.exec(value.trim());
  if (!match) return value;
  const name = match[1].trim().replace(/^"|"$/g, "");
  return name ? `${encodeHeader(name)} <${match[2]}>` : `<${match[2]}>`;
}

export interface GmailSend {
  from: string;
  to: string;
  cc?: string[];
  bcc?: string[];
  subject: string;
  text: string;
  html?: string | null;
  attachments?: OutboundFile[];
  threadId?: string | null;
  inReplyTo?: string | null;
  /** Extra top-level headers (List-Unsubscribe on mass email). */
  headers?: Record<string, string>;
}

/** Sends through the user's Gmail; returns Gmail ids and the Message-ID we set. */
export async function sendViaGmail(accessToken: string, msg: GmailSend) {
  const domain = msg.from.split("@")[1]?.replace(/>$/, "") || "gmail.com";
  const messageId = `<${randomUUID()}@${domain}>`;
  const headers = [
    `From: ${encodeAddress(msg.from)}`,
    `To: ${msg.to}`,
    ...(msg.cc?.length ? [`Cc: ${msg.cc.join(", ")}`] : []),
    // Gmail strips Bcc from what recipients see and delivers to it.
    ...(msg.bcc?.length ? [`Bcc: ${msg.bcc.join(", ")}`] : []),
    `Subject: ${encodeHeader(msg.subject)}`,
    `Message-ID: ${messageId}`,
    "MIME-Version: 1.0",
  ];
  // Only a well-formed <id@host> with no line breaks: anything else could inject headers.
  const inReplyTo = messageIdHeader(msg.inReplyTo);
  if (inReplyTo) headers.push(`In-Reply-To: ${inReplyTo}`, `References: ${inReplyTo}`);
  for (const [name, value] of Object.entries(msg.headers ?? {})) {
    if (/^[A-Za-z][A-Za-z0-9-]*$/.test(name)) headers.push(`${name}: ${value.replace(/[\r\n]+/g, " ")}`);
  }
  const encode = (value: string | Buffer) =>
    (typeof value === "string" ? Buffer.from(value, "utf8") : value).toString("base64").replace(/(.{76})/g, "$1\r\n");
  const part = (type: string, value: string) =>
    `Content-Type: ${type}; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${encode(value)}`;
  // Plain text first, HTML last: clients show the last part they can render.
  let body: string;
  if (msg.html) {
    const alt = `lc-${randomUUID()}`;
    body = `Content-Type: multipart/alternative; boundary="${alt}"\r\n\r\n--${alt}\r\n${part("text/plain", msg.text)}\r\n--${alt}\r\n${part("text/html", msg.html)}\r\n--${alt}--`;
  } else {
    body = part("text/plain", msg.text);
  }
  if (msg.attachments?.length) {
    const mixed = `lc-${randomUUID()}`;
    const files = msg.attachments.map((a) => {
      const name = encodeHeader(a.filename.replace(/["\r\n]/g, ""));
      return `Content-Type: ${a.contentType}; name="${name}"\r\nContent-Disposition: attachment; filename="${name}"\r\nContent-Transfer-Encoding: base64\r\n\r\n${encode(a.content)}`;
    });
    body = `Content-Type: multipart/mixed; boundary="${mixed}"\r\n\r\n${[body, ...files].map((p) => `--${mixed}\r\n${p}`).join("\r\n")}\r\n--${mixed}--`;
  }
  // The body starts with its own Content-Type line, so it continues the top-level headers.
  const raw = Buffer.from(`${headers.join("\r\n")}\r\n${body}`).toString("base64url");
  const sent = await gmailFetch<{ id: string; threadId: string }>(accessToken, "/messages/send", {
    method: "POST",
    body: JSON.stringify(msg.threadId ? { raw, threadId: msg.threadId } : { raw }),
  });
  return { ...sent, messageId };
}
