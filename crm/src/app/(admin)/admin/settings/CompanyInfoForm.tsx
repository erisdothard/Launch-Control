"use client";

import { useActionState, useState } from "react";
import Image from "next/image";
import { updateCompanyInfo } from "./actions";
import { BrandLockup, BrandMark } from "@/components/brand/BrandMark";
import type { CompanyInfo } from "@/lib/store/company";

interface CompanyInfoFormProps {
  company: CompanyInfo;
}

const initialState: { error?: string; success?: boolean } = {};

export default function CompanyInfoForm({ company }: CompanyInfoFormProps) {
  const [logoPreview, setLogoPreview] = useState<string | null>(company.logoUrl);
  const [previewName, setPreviewName] = useState(company.name);
  const [dirty, setDirty] = useState(false);
  const [state, formAction, pending] = useActionState(async (_prev: typeof initialState, formData: FormData) => {
    const result = await updateCompanyInfo(formData);
    if (!result.error) setDirty(false);
    return result.error ? { error: result.error } : { success: true };
  }, initialState);

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoPreview(URL.createObjectURL(file));
  }

  return (
    <form
      action={formAction}
      onChange={() => setDirty(true)}
      aria-labelledby="company-heading"
      className="space-y-5"
    >
      <div>
        <h2 id="company-heading" className="text-[22px] font-semibold tracking-[-0.02em] text-[var(--color-steel)]">
          Your company
        </h2>
        <p className="mt-1.5 max-w-2xl text-base text-[var(--color-text-muted)]">The name and logo at the top of the sidebar, and the details the CRM keeps on file.</p>
      </div>
      {state.error && (
        <p role="alert" className="well px-4 py-3 text-base text-[var(--color-hot)]">
          {state.error}
        </p>
      )}

      <div className="card grid grid-cols-1 overflow-hidden md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        {/* The logo tile is the upload button; the sidebar preview shows where it lands. */}
        <div className="flex flex-col gap-5 border-b border-[var(--color-border)] bg-[var(--color-bg-primary)] p-5 sm:p-7 md:border-r md:border-b-0">
          <label className="group block cursor-pointer">
            <span className="mb-2 block text-sm text-[var(--color-text-dim)]">Logo</span>
            <span className="flex h-36 w-full items-center justify-center overflow-hidden rounded-[var(--radius-md)] border border-dashed border-[var(--color-border-bright)] bg-[var(--color-bg-secondary)] transition-colors group-hover:border-[var(--color-steel)]">
              {logoPreview ? (
                <Image src={logoPreview} alt="Logo preview" width={240} height={120} className="max-h-[70%] w-auto max-w-[70%] object-contain" unoptimized />
              ) : (
                <span className="text-center text-sm text-[var(--color-text-dim)]">
                  <BrandMark className="mx-auto mb-3 h-10 w-auto opacity-60" />
                  No logo yet. Click to add yours.
                </span>
              )}
            </span>
            <span className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
              <span className="btn btn-secondary btn-sm pointer-events-none">{logoPreview ? "Change logo" : "Upload a logo"}</span>
              <span className="text-[var(--color-text-dim)]">PNG, JPEG, WebP or SVG, up to 2MB</span>
            </span>
            <input type="file" name="logo" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={handleLogoChange} className="sr-only" />
          </label>

          <div>
            <p className="mb-2 text-sm text-[var(--color-text-dim)]">In the sidebar</p>
            {/* Same rule as the sidebar: an uploaded logo shows with the name, otherwise the Launch Control lockup. */}
            <div className="flex h-14 items-center gap-2.5 rounded-[var(--radius-md)] bg-[var(--color-bg-sidebar)] px-4">
              {logoPreview ? (
                <>
                  <Image src={logoPreview} alt="" width={28} height={28} className="h-7 w-7 shrink-0 rounded-[2px] object-cover" unoptimized />
                  <span className="truncate font-[family-name:var(--font-display)] text-[11px] tracking-[var(--tracking-signage)] text-[var(--color-steel)] uppercase">
                    {previewName || "Your company"}
                  </span>
                </>
              ) : (
                <BrandLockup className="text-[10.5px]" />
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 content-start gap-x-5 gap-y-5 p-5 sm:grid-cols-2 sm:p-7">
          <div className="sm:col-span-2">
            <label htmlFor="name" className="mb-1.5 block text-sm text-[var(--color-text-dim)]">
              Company name
            </label>
            <input id="name" name="name" type="text" required defaultValue={company.name} onChange={(e) => setPreviewName(e.target.value)} className="field" />
          </div>
          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm text-[var(--color-text-dim)]">
              Contact email
            </label>
            <input id="email" name="email" type="email" defaultValue={company.email} placeholder="e.g. hello@yourcompany.com" className="field" />
          </div>
          <div>
            <label htmlFor="phone" className="mb-1.5 block text-sm text-[var(--color-text-dim)]">
              Phone
            </label>
            <input id="phone" name="phone" type="tel" defaultValue={company.phone} placeholder="e.g. (555) 555-0100" className="field" />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="address" className="mb-1.5 block text-sm text-[var(--color-text-dim)]">
              Address
            </label>
            <input id="address" name="address" type="text" defaultValue={company.address} placeholder="e.g. 123 Main St, Nashville, TN" className="field" />
          </div>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            <button type="submit" disabled={pending || !dirty} className={`btn btn-sm disabled:!opacity-70 ${dirty ? "btn-primary" : "btn-secondary"}`}>
              {pending ? "Saving..." : dirty ? "Save changes" : "No changes"}
            </button>
            {state.success && !dirty && (
              <span role="status" className="text-sm text-[var(--color-success)]">
                ✓ Saved. The sidebar shows it now.
              </span>
            )}
          </div>
        </div>
      </div>
    </form>
  );
}
