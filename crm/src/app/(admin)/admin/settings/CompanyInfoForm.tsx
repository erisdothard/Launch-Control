"use client";

import { useActionState, useState } from "react";
import Image from "next/image";
import { updateCompanyInfo } from "./actions";
import type { CompanyInfo } from "@/lib/store/company";

interface CompanyInfoFormProps {
  company: CompanyInfo;
}

const initialState: { error?: string; success?: boolean } = {};

const labelClass = "mb-2 block text-base font-medium text-[var(--color-text)]";

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
    <form action={formAction} aria-labelledby="company-heading" className="card max-w-3xl space-y-6 p-5 sm:p-6">
      <div>
        <h2 id="company-heading" className="label-mono text-[var(--color-steel)]">
          Company
        </h2>
        <p className="mt-2 text-base text-[var(--color-text-muted)]">The name and logo at the top of the sidebar, and the contact details on outgoing mail.</p>
      </div>

      {state.error && (
        <div role="alert" className="rounded-[2px] border border-[var(--color-danger)] bg-[var(--color-danger-bg)] px-4 py-3 text-base text-[var(--color-danger)]">
          {state.error}
        </div>
      )}
      {state.success && (
        <div role="status" className="rounded-[2px] border border-[var(--color-ok)] bg-[var(--color-ok-bg)] px-4 py-3 text-base text-[var(--color-ok)]">
          Saved. This is what shows in the sidebar now.
        </div>
      )}

      <div>
        <label htmlFor="logo" className={labelClass}>
          Logo
        </label>
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[2px] border border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
            {logoPreview ? (
              <Image src={logoPreview} alt="Logo preview" width={56} height={56} className="h-full w-full object-cover" unoptimized />
            ) : (
              <span className="text-lg font-semibold text-[var(--color-text-dim)]">{company.name ? company.name[0].toUpperCase() : "?"}</span>
            )}
          </div>
          <input
            id="logo"
            type="file"
            name="logo"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            onChange={handleLogoChange}
            className="t-small min-w-0 text-[var(--color-text-muted)] file:mr-3 file:min-h-[44px] file:cursor-pointer file:rounded-[2px] file:border file:border-[var(--color-border-bright)] file:bg-[var(--color-bg-card)] file:px-4 file:py-2.5 file:text-base file:font-medium file:text-[var(--color-text)] hover:file:border-[var(--color-text)]"
          />
        </div>
        <p className="t-small mt-2 text-[var(--color-text-dim)]">PNG, JPEG, WebP or SVG, up to 2MB.</p>
      </div>

      <div>
        <label htmlFor="name" className={labelClass}>
          Company name
        </label>
        <input id="name" name="name" type="text" required defaultValue={company.name} className="input" />
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="email" className={labelClass}>
            Contact email
          </label>
          <input id="email" name="email" type="email" defaultValue={company.email} placeholder="hello@yourcompany.com" className="input" />
        </div>
        <div>
          <label htmlFor="phone" className={labelClass}>
            Phone
          </label>
          <input id="phone" name="phone" type="tel" defaultValue={company.phone} placeholder="(555) 555-0100" className="input" />
        </div>
      </div>

      <div>
        <label htmlFor="address" className={labelClass}>
          Address
        </label>
        <input id="address" name="address" type="text" defaultValue={company.address} placeholder="123 Main St, Nashville, TN" className="input" />
      </div>

      <button type="submit" disabled={pending} className="btn btn-primary">
        {pending ? "Saving..." : "Save changes"}
      </button>
    </form>
  );
}
