"use client";

import { useActionState, useState } from "react";
import Image from "next/image";
import { updateCompanyInfo } from "./actions";
import type { CompanyInfo } from "@/lib/store/company";

interface CompanyInfoFormProps {
  company: CompanyInfo;
}

const initialState: { error?: string; success?: boolean } = {};

export default function CompanyInfoForm({ company }: CompanyInfoFormProps) {
  const [logoPreview, setLogoPreview] = useState<string | null>(company.logoUrl);
  const [state, formAction, pending] = useActionState(async (_prev: typeof initialState, formData: FormData) => {
    const result = await updateCompanyInfo(formData);
    return result.error ? { error: result.error } : { success: true };
  }, initialState);

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoPreview(URL.createObjectURL(file));
  }

  return (
    <form action={formAction} className="max-w-xl space-y-6 rounded-[2px] border border-[var(--color-border)] bg-[var(--color-bg-card)] p-6">
      {state.error && (
        <div className="rounded-[2px] border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-300">{state.error}</div>
      )}
      {state.success && (
        <div className="rounded-[2px] border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-300">
          Saved — this is what shows in the sidebar now.
        </div>
      )}

      <div>
        <label className="mb-2 block text-sm font-medium text-[var(--color-text-muted)]">Logo</label>
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[2px] bg-[var(--color-bg-secondary)]">
            {logoPreview ? (
              <Image src={logoPreview} alt="Logo preview" width={56} height={56} className="h-full w-full object-cover" unoptimized />
            ) : (
              <span className="text-lg font-semibold text-[var(--color-text-dim)]">
                {company.name ? company.name[0].toUpperCase() : "?"}
              </span>
            )}
          </div>
          <input
            type="file"
            name="logo"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            onChange={handleLogoChange}
            className="text-sm text-[var(--color-text-muted)] file:mr-3 file:rounded-[2px] file:border-0 file:bg-[var(--color-bg-secondary)] file:px-3 file:py-2 file:text-sm file:font-medium file:text-[var(--color-text)] hover:file:bg-black/[0.06]"
          />
        </div>
        <p className="mt-1.5 text-xs text-[var(--color-text-dim)]">PNG, JPEG, WebP, or SVG. Up to 2MB.</p>
      </div>

      <div>
        <label htmlFor="name" className="mb-1.5 block text-sm font-medium text-[var(--color-text-muted)]">
          Company name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          defaultValue={company.name}
          className="w-full rounded-[2px] border border-transparent bg-[var(--color-bg-secondary)] px-4 py-2.5 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]/50 focus:ring-1 focus:ring-[var(--color-accent)]/30"
        />
      </div>

      <div>
        <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-[var(--color-text-muted)]">
          Contact email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          defaultValue={company.email}
          placeholder="hello@yourcompany.com"
          className="w-full rounded-[2px] border border-transparent bg-[var(--color-bg-secondary)] px-4 py-2.5 text-sm text-[var(--color-text)] placeholder-[var(--color-text-dim)] outline-none focus:border-[var(--color-accent)]/50 focus:ring-1 focus:ring-[var(--color-accent)]/30"
        />
      </div>

      <div>
        <label htmlFor="phone" className="mb-1.5 block text-sm font-medium text-[var(--color-text-muted)]">
          Phone
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          defaultValue={company.phone}
          placeholder="(555) 555-0100"
          className="w-full rounded-[2px] border border-transparent bg-[var(--color-bg-secondary)] px-4 py-2.5 text-sm text-[var(--color-text)] placeholder-[var(--color-text-dim)] outline-none focus:border-[var(--color-accent)]/50 focus:ring-1 focus:ring-[var(--color-accent)]/30"
        />
      </div>

      <div>
        <label htmlFor="address" className="mb-1.5 block text-sm font-medium text-[var(--color-text-muted)]">
          Address
        </label>
        <input
          id="address"
          name="address"
          type="text"
          defaultValue={company.address}
          placeholder="123 Main St, Nashville, TN"
          className="w-full rounded-[2px] border border-transparent bg-[var(--color-bg-secondary)] px-4 py-2.5 text-sm text-[var(--color-text)] placeholder-[var(--color-text-dim)] outline-none focus:border-[var(--color-accent)]/50 focus:ring-1 focus:ring-[var(--color-accent)]/30"
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="rounded-[2px] bg-[var(--color-accent)] px-5 py-2.5 font-display text-[11px] uppercase tracking-[var(--tracking-signage)] text-[var(--color-on-accent)] transition-all hover:bg-[var(--color-accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Saving..." : "Save changes"}
      </button>
    </form>
  );
}
