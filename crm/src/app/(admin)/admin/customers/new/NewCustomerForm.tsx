"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createCustomerAction } from "../actions";

const inputClass =
  "w-full rounded-[2px] border border-transparent bg-[var(--color-bg-secondary)] px-4 py-2.5 text-sm text-[var(--color-text)] placeholder-[var(--color-text-dim)] outline-none focus:border-[var(--color-accent)]/50 focus:ring-1 focus:ring-[var(--color-accent)]/30";
const labelClass = "mb-1.5 block text-sm font-medium text-[var(--color-text-muted)]";

export default function NewCustomerForm() {
  const router = useRouter();
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
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
    await createCustomerAction({ businessName, email, phone, notes });
    router.push("/admin/customers");
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-xl space-y-5 rounded-[2px] border border-[var(--color-border)] bg-[var(--color-bg-card)] p-6">
      {error && <div className="rounded-[2px] border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-300">{error}</div>}

      <div>
        <label htmlFor="businessName" className={labelClass}>
          Business name
        </label>
        <input
          id="businessName"
          value={businessName}
          onChange={(e) => setBusinessName(e.target.value)}
          required
          className={inputClass}
          placeholder="Acme HVAC"
        />
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="email" className={labelClass}>
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
            placeholder="owner@acmehvac.com"
          />
        </div>
        <div>
          <label htmlFor="phone" className={labelClass}>
            Phone
          </label>
          <input
            id="phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={inputClass}
            placeholder="(615) 555-0100"
          />
        </div>
      </div>

      <div>
        <label htmlFor="notes" className={labelClass}>
          Notes
        </label>
        <textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          className={inputClass}
          placeholder="Anything worth remembering about this customer"
        />
      </div>

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-[2px] bg-[var(--color-accent)] px-5 py-2.5 font-display text-[11px] uppercase tracking-[var(--tracking-signage)] text-[var(--color-on-accent)] transition-all hover:bg-[var(--color-accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Adding..." : "Add Customer"}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-[2px] px-5 py-2.5 text-sm font-medium text-[var(--color-text-muted)] transition-colors hover:bg-white/[0.05]"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
