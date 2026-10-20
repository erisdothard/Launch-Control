"use client";

import { LiveryStripe } from "@/components/brand/BrandMark";

interface AdminHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

/* Page title block: stripe, 28px title (36px from the sm breakpoint), 16px muted subtitle, actions. */
export default function AdminHeader({ title, subtitle, actions }: AdminHeaderProps) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <LiveryStripe className="mb-4" />
        <h1 className="text-[28px] leading-tight font-semibold tracking-tight text-[var(--color-steel)] sm:text-[36px]">{title}</h1>
        {subtitle && <p className="mt-2 text-base text-[var(--color-text-muted)]">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-3">{actions}</div>}
    </header>
  );
}
