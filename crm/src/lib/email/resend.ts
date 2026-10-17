import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { emailConfig } from "./config";

const API = "https://api.resend.com";

async function resendFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${emailConfig.resendKey}`, "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  const body = (await res.json().catch(() => ({}))) as T & { message?: string };
  if (!res.ok) throw new Error(`Resend ${res.status}: ${body.message ?? "request failed"}`);
  return body;
}

export interface ResendSend {
  from: string;
  to: string;
  subject: string;
  text: string;
  replyTo: string;
  inReplyTo?: string | null;
}

export async function sendViaResend(msg: ResendSend): Promise<{ id: string }> {
  const headers: Record<string, string> = {};
  if (msg.inReplyTo) {
    headers["In-Reply-To"] = msg.inReplyTo;
    headers.References = msg.inReplyTo;
  }
  return resendFetch<{ id: string }>("/emails", {
    method: "POST",
    body: JSON.stringify({ from: msg.from, to: [msg.to], subject: msg.subject, text: msg.text, reply_to: msg.replyTo, headers }),
  });
}

export interface ReceivedEmail {
  id: string;
  from: string;
  to: string[];
  subject: string;
  text: string | null;
  html: string | null;
  message_id: string | null;
  received_for?: string[];
}

export async function fetchReceivedEmail(id: string): Promise<ReceivedEmail> {
  return resendFetch<ReceivedEmail>(`/emails/receiving/${encodeURIComponent(id)}`);
}

// Resend signs webhooks the Svix way: HMAC-SHA256 over "<svix-id>.<svix-timestamp>.<body>" with
// the base64 secret after "whsec_"; svix-signature lists "v1,<base64>" values.
const TOLERANCE_SECONDS = 5 * 60;

export function verifyResendWebhook(body: string, headers: Headers, secret = emailConfig.resendWebhookSecret): boolean {
  const id = headers.get("svix-id");
  const timestamp = headers.get("svix-timestamp");
  const signatures = headers.get("svix-signature");
  if (!secret || !id || !timestamp || !signatures) return false;
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > TOLERANCE_SECONDS) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest();
  return signatures.split(" ").some((entry) => {
    const [version, sig] = entry.split(",");
    if (version !== "v1" || !sig) return false;
    const given = Buffer.from(sig, "base64");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}
