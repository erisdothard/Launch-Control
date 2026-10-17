import "server-only";
import { randomUUID } from "node:crypto";
import { emailConfig } from "./config";

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

export interface GmailSend {
  from: string;
  to: string;
  subject: string;
  text: string;
  threadId?: string | null;
  inReplyTo?: string | null;
}

/** Sends through the user's Gmail; returns Gmail ids and the Message-ID we set. */
export async function sendViaGmail(accessToken: string, msg: GmailSend) {
  const domain = msg.from.split("@")[1]?.replace(/>$/, "") || "gmail.com";
  const messageId = `<${randomUUID()}@${domain}>`;
  const headers = [
    `From: ${encodeHeader(msg.from)}`,
    `To: ${msg.to}`,
    `Subject: ${encodeHeader(msg.subject)}`,
    `Message-ID: ${messageId}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
  ];
  if (msg.inReplyTo) headers.push(`In-Reply-To: ${msg.inReplyTo}`, `References: ${msg.inReplyTo}`);
  const body = Buffer.from(msg.text, "utf8").toString("base64").replace(/(.{76})/g, "$1\r\n");
  const raw = Buffer.from(`${headers.join("\r\n")}\r\n\r\n${body}`).toString("base64url");
  const sent = await gmailFetch<{ id: string; threadId: string }>(accessToken, "/messages/send", {
    method: "POST",
    body: JSON.stringify(msg.threadId ? { raw, threadId: msg.threadId } : { raw }),
  });
  return { ...sent, messageId };
}
