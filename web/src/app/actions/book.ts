"use server";

import { headers } from "next/headers";
import { site } from "@/content/site";
import { log } from "@/lib/log";
import {
  bookingSchema,
  readBookingForm,
  toFieldErrors,
  type BookingState,
} from "@/lib/bookingSchema";

/* In-memory token bucket per IP. Survives for the life of the server process only. */
const BUCKET_CAPACITY = 5;
const REFILL_PER_SECOND = 5 / 60; // five bookings a minute, sustained
const buckets = new Map<string, { tokens: number; updatedAt: number }>();

function takeToken(key: string): boolean {
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

async function clientKey(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}

export async function bookLaunch(
  _prev: BookingState,
  formData: FormData,
): Promise<BookingState> {
  const key = await clientKey();
  if (!takeToken(key)) {
    log.warn("booking.rate_limited", { key });
    return { ok: false, errors: { form: site.book.errors.network } };
  }

  const parsed = bookingSchema.safeParse(readBookingForm(formData));
  if (!parsed.success) {
    log.info("booking.invalid", { fields: Object.keys(toFieldErrors(parsed.error)).join(",") });
    return { ok: false, errors: toFieldErrors(parsed.error) };
  }

  // The structured line is the booking store for now. Nothing else logs it.
  log.info("booking.received", parsed.data);
  return { ok: true };
}
