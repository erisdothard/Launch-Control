"use server";

import { site } from "@/content/site";
import { log } from "@/lib/log";
import { clientKey, sendToCrm, takeToken } from "@/lib/inquiry";
import {
  demoMessageSchema,
  readDemoMessageForm,
  toDemoMessageErrors,
  type DemoMessageState,
} from "@/lib/demoMessageSchema";

/*
  The message form on a client demo page. Unlike the booking form, a failed CRM post is reported
  to the visitor (with a direct mailto), because nothing else would surface the message to Maxwell.
*/
export async function sendDemoMessage(
  slug: string,
  _prev: DemoMessageState,
  formData: FormData,
): Promise<DemoMessageState> {
  const { demoContact } = site;
  const film = site.clientFilms.find((f) => f.slug === slug);
  if (!film) return { ok: false, errors: { form: demoContact.errors.network } };

  const key = await clientKey();
  if (!takeToken(key)) {
    log.warn("demo_message.rate_limited", { key });
    return { ok: false, errors: { form: demoContact.errors.network } };
  }

  const parsed = demoMessageSchema.safeParse(readDemoMessageForm(formData));
  if (!parsed.success) return { ok: false, errors: toDemoMessageErrors(parsed.error) };

  const { name, email, message } = parsed.data;
  log.info("demo_message.received", { slug, name, email, message });
  const landed = await sendToCrm(
    { name, email, launching: `${demoContact.notePrefix} ${film.client}\n${message}` },
    "demo_message",
  );
  return landed ? { ok: true } : { ok: false, errors: { form: demoContact.errors.network } };
}
