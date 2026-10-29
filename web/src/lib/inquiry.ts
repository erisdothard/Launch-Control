import { headers } from "next/headers";
import { log } from "@/lib/log";

/*
  Shared by the server actions that hand a visitor's details to the CRM (the booking form and the
  client demo pages): a per-IP rate limit and the server-to-server post to crm/src/app/api/inquiry.
*/

/* In-memory token bucket per IP. Survives for the life of the server process only. */
const BUCKET_CAPACITY = 5;
const REFILL_PER_SECOND = 5 / 60; // five a minute, sustained
const buckets = new Map<string, { tokens: number; updatedAt: number }>();

export function takeToken(key: string): boolean {
  const now = Date.now();
  const bucket = buckets.get(key) ?? { tokens: BUCKET_CAPACITY, updatedAt: now };
  const refilled = Math.min(
    BUCKET_CAPACITY,
    bucket.tokens + ((now - bucket.updatedAt) / 1000) * REFILL_PER_SECOND,
  );
  if (refilled < 1) {
    buckets.set(key, { tokens: refilled, updatedAt: now });
    return false;
  }
  buckets.set(key, { tokens: refilled - 1, updatedAt: now });
  return true;
}

export async function clientKey(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}

const CRM_TIMEOUT_MS = 8000;

export interface Inquiry {
  name: string;
  email: string;
  launching: string;
  budget?: string;
}

/**
 * Posts to the CRM, where a new address becomes a lead due for follow-up today. Returns whether it
 * landed; `event` prefixes the log lines (e.g. "booking" logs booking.crm_failed).
 */
export async function sendToCrm(inquiry: Inquiry, event: string): Promise<boolean> {
  const url = process.env.CRM_INQUIRY_URL;
  const secret = process.env.INQUIRY_SECRET;
  if (!url || !secret) {
    log.warn(`${event}.crm_not_configured`);
    return false;
  }
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${secret}` },
      body: JSON.stringify(inquiry),
      cache: "no-store",
      signal: AbortSignal.timeout(CRM_TIMEOUT_MS),
    });
    if (!res.ok) log.error(`${event}.crm_failed`, { status: res.status, email: inquiry.email });
    return res.ok;
  } catch (error) {
    log.error(`${event}.crm_failed`, { status: 0, email: inquiry.email, reason: error instanceof Error ? error.name : "unknown" });
    return false;
  }
}
