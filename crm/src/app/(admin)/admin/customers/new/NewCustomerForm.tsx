"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createCustomerAction } from "../actions";

const labelClass = "mb-2 block text-base font-medium text-[var(--color-text)]";

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
    try {
      await createCustomerAction({ businessName, email, phone, notes });
      router.push("/admin/customers");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add the customer. Try again.");
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
        <label htmlFor="notes" className={labelClass}>
          Notes
        </label>
        <textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} className="input" placeholder="Anything worth remembering about this customer" />
      </div>

      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? "Adding..." : "Add customer"}
        </button>
        <button type="button" onClick={() => router.back()} className="btn btn-secondary">
          Cancel
        </button>
      </div>
    </form>
  );
}
