"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createLeadAction, type CreateLeadResult } from "../actions";

const inputClass =
  "w-full rounded-[2px] border border-transparent bg-[var(--color-bg-secondary)] px-4 py-2.5 text-sm text-[var(--color-text)] placeholder-[var(--color-text-dim)] outline-none focus:border-[var(--color-accent)]/50 focus:ring-1 focus:ring-[var(--color-accent)]/30";
const labelClass = "mb-1.5 block text-sm font-medium text-[var(--color-text-muted)]";

export default function NewLeadForm() {
  const router = useRouter();
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [source, setSource] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [duplicate, setDuplicate] = useState<{ id: string; businessName: string } | null>(null);

  async function save(allowDuplicate: boolean) {
    setError(null);
    setPending(true);
    let result: CreateLeadResult;
    try {
      result = await createLeadAction({ businessName, email, phone, source, notes }, allowDuplicate);
    } catch {
      setPending(false);
      setError("Couldn't add the lead. Try again.");
      return;
    }
    if (result.ok) {
      router.push(`/admin/leads/${result.id}`);
      return;
    }
    setPending(false);
    setDuplicate(result.duplicate);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!businessName.trim()) {
      setError("Business name is required.");
      return;
    }
    setDuplicate(null);
    await save(false);
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-xl space-y-5 rounded-[2px] border border-[var(--color-border)] bg-[var(--color-bg-card)] p-6">
      {error && <div className="rounded-[2px] border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-300">{error}</div>}
      {duplicate && (
        <div role="alert" className="rounded-[2px] border border-[var(--color-livery-orange)]/40 bg-[var(--color-livery-orange)]/10 px-4 py-3 text-sm text-[var(--color-text)]">
          Already in the CRM as{" "}
          <Link href={`/admin/leads/${duplicate.id}`} className="font-medium text-[var(--color-accent)] hover:underline">
            {duplicate.businessName}
          </Link>
          .{" "}
          <button type="button" onClick={() => save(true)} disabled={pending} className="text-[var(--color-text-muted)] underline hover:text-[var(--color-text)]">
            Add it anyway
          </button>
        </div>
      )}

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
        <label htmlFor="source" className={labelClass}>
          Source
        </label>
        <input
          id="source"
          value={source}
          onChange={(e) => setSource(e.target.value)}
          className={inputClass}
          placeholder="Referral, Website Form, Google Maps..."
        />
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
          placeholder="Anything worth remembering about this lead"
        />
      </div>

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-[2px] bg-[var(--color-accent)] px-5 py-2.5 font-display text-[11px] uppercase tracking-[var(--tracking-signage)] text-[var(--color-on-accent)] transition-all hover:bg-[var(--color-accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Adding..." : "Add Lead"}
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
