// One-click unsubscribe for mass email (RFC 8058). Each campaign email carries a signed link to
// /api/unsubscribe; the token names the address (and lead) and is HMAC-signed so nobody can opt
// someone else out by guessing. Pure functions; the secret is passed in, so tests need no env.
import { createHmac, timingSafeEqual } from "node:crypto";

export interface UnsubscribeTarget {
  email: string;
  leadId: string | null;
}

/**
 * Where a visible "Unsubscribe" line would go in a campaign's footer. Off until the owner decides
 * on wording; the headers below already give Gmail and Outlook their one-click button.
 */
export const SHOW_UNSUBSCRIBE_FOOTER = false;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(`unsubscribe:${payload}`).digest("base64url");
}

export function unsubscribeToken(target: UnsubscribeTarget, secret: string): string {
  if (!secret) throw new Error("No unsubscribe secret configured");
  const payload = Buffer.from(`${target.email.trim().toLowerCase()}|${target.leadId ?? ""}`, "utf8").toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

/** The address and lead a token names, or null when it is malformed or the signature is wrong. */
export function readUnsubscribeToken(token: string, secret: string): UnsubscribeTarget | null {
  if (!secret || typeof token !== "string" || token.length > 600) return null;
  const [payload, mac, extra] = token.split(".");
  if (!payload || !mac || extra !== undefined) return null;
  const given = Buffer.from(mac);
  const expected = Buffer.from(sign(payload, secret));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const [email, leadId, more] = Buffer.from(payload, "base64url").toString("utf8").split("|");
  if (more !== undefined || !email || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) return null;
  if (leadId && !UUID.test(leadId)) return null;
  return { email, leadId: leadId || null };
}

/** The List-Unsubscribe headers for one recipient: an https one-click link and a mailto fallback. */
export function unsubscribeHeaders(target: UnsubscribeTarget, baseUrl: string, replyAddress: string, secret: string): Record<string, string> {
  const url = new URL("/api/unsubscribe", baseUrl);
  url.searchParams.set("t", unsubscribeToken(target, secret));
  const mailto = `mailto:${replyAddress}?subject=unsubscribe`;
  return {
    "List-Unsubscribe": `<${url.toString()}>, <${mailto}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}
