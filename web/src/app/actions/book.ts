"use server";

import { site } from "@/content/site";
import { log } from "@/lib/log";
import { clientKey, sendToCrm, takeToken } from "@/lib/inquiry";
import {
  bookingSchema,
  readBookingForm,
  toFieldErrors,
  type BookingState,
} from "@/lib/bookingSchema";

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

  log.info("booking.received", parsed.data);
  /* The visitor still sees success if the CRM post fails: the booking.received line above keeps the
     details, and booking.crm_failed flags the ones to enter by hand. */
  await sendToCrm(parsed.data, "booking");
  return { ok: true };
}
