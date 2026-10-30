/*
  Client demo message form schema. Shared by the form (submit validation) and the server action
  (authoritative validation). Messages come from site.ts.
*/

import { z } from "zod";
import { site } from "@/content/site";

const { required, email } = site.demoContact.errors;

export const demoMessageSchema = z.object({
  name: z.string().trim().min(1, required).max(120, required),
  email: z.string().trim().min(1, required).pipe(z.email(email)),
  message: z.string().trim().min(1, required).max(2000, required),
});

export type DemoMessageField = keyof z.infer<typeof demoMessageSchema>;
export type DemoMessageErrors = Partial<Record<DemoMessageField, string>>;

export type DemoMessageState =
  | { ok: true }
  | { ok: false; errors: DemoMessageErrors & { form?: string } }
  | { ok: null };

export const initialDemoMessageState: DemoMessageState = { ok: null };

/** Collapse zod issues into one message per field (first issue wins). */
export function toDemoMessageErrors(error: z.ZodError): DemoMessageErrors {
  return error.issues.reduce<DemoMessageErrors>((acc, issue) => {
    const key = issue.path[0];
    if (typeof key !== "string" || !(key in demoMessageSchema.shape)) return acc;
    const field = key as DemoMessageField;
    return acc[field] ? acc : { ...acc, [field]: issue.message };
  }, {});
}

export function readDemoMessageForm(formData: FormData): Record<DemoMessageField, string> {
  const read = (key: DemoMessageField): string => {
    const value = formData.get(key);
    return typeof value === "string" ? value : "";
  };
  return { name: read("name"), email: read("email"), message: read("message") };
}
