"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createLeadAction, type CreateLeadResult } from "../actions";

const labelClass = "t-small mb-1.5 block font-medium text-[var(--color-text-muted)]";

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
    <form onSubmit={handleSubmit} className="card max-w-xl space-y-5 p-6">
      {error && (
        <div role="alert" className="rounded-[2px] border border-[var(--color-danger)] bg-[var(--color-danger-bg)] px-4 py-3 text-[var(--color-danger)]">
          {error}
        </div>
      )}
      {duplicate && (
        <div role="alert" className="rounded-[2px] border border-[var(--color-warn)] bg-[var(--color-warn-bg)] px-4 py-3 text-[var(--color-text)]">
          Already in the CRM as{" "}
          <Link href={`/admin/leads/${duplicate.id}`} className="link">
            {duplicate.businessName}
          </Link>
          .{" "}
          <button type="button" onClick={() => save(true)} disabled={pending} className="link underline">
            Add it anyway
          </button>
        </div>
      )}

      <div>
        <label htmlFor="businessName" className={labelClass}>
          Business name
        </label>
        <input id="businessName" value={businessName} onChange={(e) => setBusinessName(e.target.value)} required className="input" placeholder="Acme HVAC" />
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="email" className={labelClass}>
            Email
          </label>
          <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input" placeholder="owner@acmehvac.com" />
        </div>
        <div>
          <label htmlFor="phone" className={labelClass}>
            Phone
          </label>
          <input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="input" placeholder="(615) 555-0100" />
        </div>
      </div>

      <div>
        <label htmlFor="source" className={labelClass}>
          Where they came from
        </label>
        <input id="source" value={source} onChange={(e) => setSource(e.target.value)} className="input" placeholder="Referral, trade show, Google Maps..." />
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
          className="input"
          placeholder="Anything worth remembering about this lead"
        />
      </div>

      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? "Adding..." : "Add Lead"}
        </button>
        <button type="button" onClick={() => router.back()} className="btn-quiet">
          Cancel
        </button>
      </div>
    </form>
  );
}
