/*
  Booking form schema. Shared by the client form (blur + submit validation)
  and the server action (authoritative validation). Messages come from site.ts.
*/

import { z } from "zod";
import { site } from "@/content/site";

const { required, email } = site.book.errors;

export const bookingSchema = z.object({
  name: z.string().trim().min(1, required).max(120, required),
  email: z.string().trim().min(1, required).pipe(z.email(email)),
  launching: z.string().trim().min(1, required).max(2000, required),
  budget: z.enum(site.book.fields.budgetOptions, { error: required }),
});

export type Booking = z.infer<typeof bookingSchema>;
export type BookingField = keyof Booking;

export const bookingFields = Object.keys(bookingSchema.shape) as BookingField[];

export type FieldErrors = Partial<Record<BookingField, string>>;

export type BookingState =
  | { ok: true }
  | { ok: false; errors: FieldErrors & { form?: string } }
  | { ok: null };

export const initialBookingState: BookingState = { ok: null };

/** Collapse zod issues into one message per field (first issue wins). */
export function toFieldErrors(error: z.ZodError): FieldErrors {
  return error.issues.reduce<FieldErrors>((acc, issue) => {
    const key = issue.path[0];
    if (typeof key !== "string" || !(key in bookingSchema.shape)) return acc;
    const field = key as BookingField;
    return acc[field] ? acc : { ...acc, [field]: issue.message };
  }, {});
}

/** Validate one field in isolation (used on blur). Returns a message or undefined. */
export function validateField(field: BookingField, value: string): string | undefined {
  const result = bookingSchema.shape[field].safeParse(value);
  return result.success ? undefined : result.error.issues[0]?.message;
}

/** Pull the booking fields out of FormData as plain strings. */
export function readBookingForm(formData: FormData): Record<BookingField, string> {
  const read = (key: BookingField): string => {
    const value = formData.get(key);
    return typeof value === "string" ? value : "";
  };
  return {
    name: read("name"),
    email: read("email"),
    launching: read("launching"),
    budget: read("budget"),
  };
}
