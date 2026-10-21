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
    <form action={formAction} aria-labelledby="company-heading" className="card p-5 sm:p-8">
      <h2 id="company-heading" className="text-[22px] font-semibold tracking-[-0.02em] text-[var(--color-steel)]">
        Company
      </h2>
      <p className="mt-2 max-w-2xl text-base text-[var(--color-text-muted)]">The name and logo in the sidebar, and the contact details the CRM keeps on file.</p>
      {state.error && (
        <p role="alert" className="well mt-5 px-4 py-3 text-base text-[var(--color-hot)]">
          {state.error}
        </p>
      )}
      {state.success && (
        <p role="status" className="well mt-5 px-4 py-3 text-base text-[var(--color-success)]">
          Saved. The sidebar shows the new details now.
        </p>
      )}

      <div className="mt-6 grid grid-cols-1 gap-x-6 gap-y-5 md:grid-cols-2">

      <div className="md:col-span-2">
        <p className="mb-2 block text-sm text-[var(--color-text-dim)]">Logo</p>
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-md)] bg-[var(--color-bg-secondary)]">
            {logoPreview ? (
              <Image src={logoPreview} alt="Logo preview" width={56} height={56} className="h-full w-full object-contain" unoptimized />
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
            className="min-w-0 text-sm text-[var(--color-text-muted)] file:mr-3 file:h-11 file:cursor-pointer file:rounded-[var(--radius-sm)] file:border-0 file:bg-[var(--color-bg-secondary)] file:px-4 file:text-sm file:font-medium file:text-[var(--color-text)] hover:file:bg-[var(--color-bg-hover)]"
          />
        </div>
        <p className="mt-2 text-sm text-[var(--color-text-dim)]">PNG, JPEG, WebP or SVG, up to 2MB.</p>
      </div>

      <div>
        <label htmlFor="name" className="mb-1.5 block text-sm text-[var(--color-text-dim)]">
          Company name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          defaultValue={company.name}
          className="field"
        />
      </div>

      <div>
        <label htmlFor="email" className="mb-1.5 block text-sm text-[var(--color-text-dim)]">
          Contact email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          defaultValue={company.email}
          placeholder="hello@yourcompany.com"
          className="field"
        />
      </div>

      <div>
        <label htmlFor="phone" className="mb-1.5 block text-sm text-[var(--color-text-dim)]">
          Phone
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          defaultValue={company.phone}
          placeholder="(555) 555-0100"
          className="field"
        />
      </div>

      <div>
        <label htmlFor="address" className="mb-1.5 block text-sm text-[var(--color-text-dim)]">
          Address
        </label>
        <input
          id="address"
          name="address"
          type="text"
          defaultValue={company.address}
          placeholder="123 Main St, Nashville, TN"
          className="field"
        />
      </div>

      </div>

      <button type="submit" disabled={pending} className="btn btn-secondary mt-6">
        {pending ? "Saving..." : "Save company details"}
      </button>
    </form>
  );
}
