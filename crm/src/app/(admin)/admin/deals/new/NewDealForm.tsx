"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createDealAction } from "../actions";

const labelClass = "mb-2 block text-base font-medium text-[var(--color-text)]";

export default function NewDealForm() {
  const router = useRouter();
  const [businessName, setBusinessName] = useState("");
  const [value, setValue] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!businessName.trim()) {
      setError("Business name is required.");
      return;
    }
    setError(null);
    setPending(true);
    try {
      await createDealAction({ businessName, value: Number(value) || 0, notes, fromLeadId: null });
      router.push("/admin/deals");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add the deal. Try again.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card max-w-xl space-y-5 p-5 sm:p-6">
      {error && (
        <div role="alert" className="rounded-[2px] border border-[var(--color-danger)] bg-[var(--color-danger-bg)] px-4 py-3 text-base text-[var(--color-danger)]">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="businessName" className={labelClass}>
          Business name
        </label>
        <input id="businessName" value={businessName} onChange={(e) => setBusinessName(e.target.value)} required className="input" placeholder="Acme HVAC" />
      </div>

      <div>
        <label htmlFor="value" className={labelClass}>
          Deal value ($)
        </label>
        <input id="value" type="number" min="0" step="1" value={value} onChange={(e) => setValue(e.target.value)} className="input" placeholder="5000" />
      </div>

      <div>
        <label htmlFor="notes" className={labelClass}>
          Notes
        </label>
        <textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} className="input" placeholder="Anything worth remembering about this deal" />
      </div>

      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? "Adding..." : "Add deal"}
        </button>
        <button type="button" onClick={() => router.back()} className="btn btn-secondary">
          Cancel
        </button>
      </div>
    </form>
  );
}
