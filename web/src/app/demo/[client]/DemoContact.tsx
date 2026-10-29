"use client";

import { useActionState, useState, type FormEvent } from "react";
import Link from "next/link";
import { site } from "@/content/site";
import { sendDemoMessage } from "@/app/actions/demoMessage";
import {
  demoMessageSchema,
  initialDemoMessageState,
  readDemoMessageForm,
  toDemoMessageErrors,
  type DemoMessageErrors,
  type DemoMessageField,
  type DemoMessageState,
} from "@/lib/demoMessageSchema";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Textarea } from "@/components/ui/Textarea";
import { Rule } from "@/components/ui/Rule";

const { demoContact } = site;

/*
  The client demo page's call to action: the button opens a message form in place, so a prospect
  can reach Maxwell without a mail app. The message lands in the CRM as a lead due today.
*/
export function DemoContact({ slug }: { slug: string }) {
  const film = site.clientFilms.find((f) => f.slug === slug);
  const [open, setOpen] = useState(false);
  const [clientErrors, setClientErrors] = useState<DemoMessageErrors>({});
  const [state, formAction, pending] = useActionState(
    async (prev: DemoMessageState, formData: FormData): Promise<DemoMessageState> => {
      try {
        return await sendDemoMessage(slug, prev, formData);
      } catch {
        return { ok: false, errors: { form: demoContact.errors.network } };
      }
    },
    initialDemoMessageState,
  );
  if (!film) return null;

  const serverErrors: DemoMessageErrors & { form?: string } = state.ok === false ? state.errors : {};
  const errorFor = (field: DemoMessageField) => clientErrors[field] ?? serverErrors[field];

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    const parsed = demoMessageSchema.safeParse(readDemoMessageForm(new FormData(event.currentTarget)));
    if (parsed.success) {
      setClientErrors({});
      return;
    }
    event.preventDefault();
    setClientErrors(toDemoMessageErrors(parsed.error));
  };

  const close = () => {
    setOpen(false);
    setClientErrors({});
    requestAnimationFrame(() => document.getElementById("demo-contact-open")?.focus());
  };

  return (
    <div className="mt-6 flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        {open ? null : (
          <Button id="demo-contact-open" variant="primary" aria-expanded={false} aria-controls="demo-contact" onClick={() => setOpen(true)}>
            {film.cta.label}
          </Button>
        )}
        <Link href="/" className="label-mono py-3 text-steel sm:px-4 no-underline hover:text-text">
          {film.home}
        </Link>
        <p className="label-mono m-0 text-subtle sm:ml-auto">{film.note}</p>
      </div>
      {open ? (
        <div id="demo-contact" className="max-w-[48rem] border border-border bg-surface p-6">
          {state.ok === true ? (
            <div className="flex flex-col gap-6" role="status" aria-live="polite">
              <p className="text-body text-text">{demoContact.success}</p>
              <Rule tone="success" />
            </div>
          ) : (
            <form action={formAction} onSubmit={onSubmit} noValidate className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div aria-live="polite" aria-atomic="true" className="sm:col-span-2 empty:hidden">
                {serverErrors.form ? (
                  <p className="field-error m-0 text-caption font-medium text-danger">
                    {serverErrors.form}{" "}
                    <a href={film.cta.fallback} className="text-text">
                      {demoContact.errors.fallback}
                    </a>
                  </p>
                ) : null}
              </div>
              <Field
                autoFocus
                id="demo-name"
                name="name"
                label={demoContact.fields.name}
                placeholder={demoContact.placeholders.name}
                autoComplete="name"
                error={errorFor("name")}
              />
              <Field
                id="demo-email"
                name="email"
                type="email"
                label={demoContact.fields.email}
                placeholder={demoContact.placeholders.email}
                autoComplete="email"
                error={errorFor("email")}
              />
              <div className="sm:col-span-2">
                <Textarea
                  id="demo-message"
                  name="message"
                  label={demoContact.fields.message}
                  placeholder={demoContact.placeholders.message}
                  error={errorFor("message")}
                />
              </div>
              <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
                <Button type="submit" disabled={pending} aria-busy={pending || undefined}>
                  {pending ? demoContact.submitting : serverErrors.form ? demoContact.errors.retry : demoContact.submit}
                </Button>
                <button type="button" onClick={close} className="label-mono cursor-pointer py-3 text-steel hover:text-text sm:px-4">
                  {demoContact.cancel}
                </button>
              </div>
            </form>
          )}
        </div>
      ) : null}
    </div>
  );
}
