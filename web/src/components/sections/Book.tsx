"use client";

import { useActionState, useState, type FocusEvent, type FormEvent } from "react";
import { site } from "@/content/site";
import { bookLaunch } from "@/app/actions/book";
import {
  bookingFields,
  bookingSchema,
  initialBookingState,
  readBookingForm,
  toFieldErrors,
  validateField,
  type BookingField,
  type BookingState,
  type FieldErrors,
} from "@/lib/bookingSchema";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Rule } from "@/components/ui/Rule";
import { Reveal } from "@/components/ui/Reveal";

const { book } = site;
const titleId = `${book.id}-title`;

async function submitBooking(prev: BookingState, formData: FormData): Promise<BookingState> {
  try {
    return await bookLaunch(prev, formData);
  } catch {
    return { ok: false, errors: { form: book.errors.network } };
  }
}

/* Success replaces the form: display type plus a success-colour rule. */
function Sent() {
  return (
    <div className="flex flex-col gap-8" role="status" aria-live="polite">
      <p className="font-display text-title uppercase leading-[1.2] tracking-display text-background">
        {book.success}
      </p>
      <Rule tone="success" />
    </div>
  );
}

type Control = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

function BookingForm() {
  const [state, formAction, pending] = useActionState(submitBooking, initialBookingState);
  const [clientErrors, setClientErrors] = useState<FieldErrors>({});

  if (state.ok === true) return <Sent />;

  const serverErrors: FieldErrors & { form?: string } = state.ok === false ? state.errors : {};
  const errorFor = (field: BookingField): string | undefined =>
    clientErrors[field] ?? serverErrors[field];
  const fieldErrors = bookingFields
    .map((field) => ({ field, message: errorFor(field) }))
    .filter((entry): entry is { field: BookingField; message: string } => Boolean(entry.message));

  const onBlur = (event: FocusEvent<Control>) => {
    const field = event.currentTarget.name as BookingField;
    const message = validateField(field, event.currentTarget.value);
    setClientErrors((prev) => ({ ...prev, [field]: message }));
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    const parsed = bookingSchema.safeParse(readBookingForm(new FormData(event.currentTarget)));
    if (parsed.success) {
      setClientErrors({});
      return;
    }
    event.preventDefault();
    setClientErrors(toFieldErrors(parsed.error));
  };

  const submitLabel = pending
    ? book.submitting
    : serverErrors.form
      ? book.errors.retry
      : book.submit;

  return (
    <form action={formAction} onSubmit={onSubmit} noValidate className="grid grid-cols-1 gap-6 sm:grid-cols-2">
      {/* Announced summary. Field messages repeat inline, so the list is visually hidden. */}
      <div aria-live="polite" aria-atomic="true" className="sm:col-span-2">
        {serverErrors.form ? (
          <p className="field-error text-caption font-medium text-danger">{serverErrors.form}</p>
        ) : null}
        {fieldErrors.length > 0 ? (
          <ul className="sr-only">
            {fieldErrors.map(({ field, message }) => (
              <li key={field}>
                {book.fields[field]}: {message}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <Field
        id="book-name"
        name="name"
        label={book.fields.name}
        autoComplete="name"
        error={errorFor("name")}
        onBlur={onBlur}
      />
      <Field
        id="book-email"
        name="email"
        type="email"
        label={book.fields.email}
        autoComplete="email"
        error={errorFor("email")}
        onBlur={onBlur}
      />
      <div className="sm:col-span-2">
        <Textarea
          id="book-launching"
          name="launching"
          label={book.fields.launching}
          error={errorFor("launching")}
          onBlur={onBlur}
        />
      </div>
      <Select
        id="book-budget"
        name="budget"
        label={book.fields.budget}
        options={book.fields.budgetOptions}
        placeholder={book.fields.budget}
        error={errorFor("budget")}
        onBlur={onBlur}
      />
      <div className="sm:self-end">
        <Button
          type="submit"
          disabled={pending}
          aria-busy={pending || undefined}
          variant="inverse"
        >
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

/* Single primary action on the page. ≤4 fields. */
export function Book() {
  return (
    <section
      id={book.id}
      aria-labelledby={titleId}
      className="relative bg-ember text-background [&_label]:text-background [&_label]:opacity-80 [&_.field-error]:text-background"
      style={{ zIndex: "var(--z-content)" }}
    >
      <div className="mx-auto max-w-content-max px-6 py-20 lg:px-12 lg:py-24 grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-8">
        <Reveal className="flex flex-col gap-6 lg:col-span-5">
          <h2 id={titleId} className="text-display text-background">
            {book.title}
          </h2>
          <p className="max-w-[70ch] text-lead text-background/80">{book.body}</p>
        </Reveal>
        <Reveal className="lg:col-span-7" delay={0.1}>
          <BookingForm />
        </Reveal>
      </div>
    </section>
  );
}
