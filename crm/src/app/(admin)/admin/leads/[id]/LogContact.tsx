"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { logOutsideContactAction } from "../actions";

// "Log outreach": an email from another mailbox, a call, a meeting at the track. It moves the lead
// along the same way the CRM's own email would and leaves a dated line in the notes. Sends nothing.

const KINDS = [
  { key: "emailed", label: "I emailed them" },
  { key: "called", label: "I called them" },
  { key: "met", label: "We met" },
  { key: "they-replied", label: "They got back to me" },
] as const;

export default function LogContact({ leadId, today, disabled }: { leadId: string; today: string; disabled: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<string>(KINDS[0].key);
  const [on, setOn] = useState(today);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await logOutsideContactAction(leadId, { kind, on, note });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setOpen(false);
        setNote("");
        router.refresh();
      } catch {
        setError("That didn't save. Try again.");
      }
    });
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} disabled={disabled} className="btn btn-secondary w-full">
        Log outreach
      </button>
    );
  }

  return (
    <form
      className="well p-4"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <fieldset disabled={pending} className="space-y-3">
        <legend className="sr-only">Log outreach made outside the CRM</legend>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="What happened">
          {KINDS.map((k) => (
            <button
              key={k.key}
              type="button"
              role="radio"
              aria-checked={kind === k.key}
              onClick={() => setKind(k.key)}
              className={`h-9 rounded-full px-3.5 text-[14px] transition-colors ${
                kind === k.key
                  ? "bg-[var(--color-steel)] font-medium text-[var(--color-on-accent)]"
                  : "text-[var(--color-text-muted)] shadow-[inset_0_0_0_1px_var(--color-border-bright)] hover:text-[var(--color-text)]"
              }`}
            >
              {k.label}
            </button>
          ))}
        </div>
        <label className="block">
          <span className="mb-1.5 block text-sm text-[var(--color-text-dim)]">When</span>
          <input type="date" className="field tabular" value={on} max={today} onChange={(e) => setOn(e.target.value)} required />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm text-[var(--color-text-dim)]">Note (optional)</span>
          <textarea rows={2} maxLength={500} className="field leading-relaxed" value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        {error && (
          <p role="alert" className="text-[15px] text-[var(--color-hot)]">
            {error}
          </p>
        )}
        <div className="flex items-center gap-3">
          <button type="submit" className="btn btn-secondary btn-sm">
            {pending ? "Saving" : "Save"}
          </button>
          <button type="button" onClick={() => setOpen(false)} className="btn-quiet">
            Cancel
          </button>
        </div>
      </fieldset>
    </form>
  );
}
