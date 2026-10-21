"use client";

import { LiveryStripe } from "@/components/brand/BrandMark";

interface AdminHeaderProps {
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}

export default function AdminHeader({ title, subtitle, actions }: AdminHeaderProps) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <LiveryStripe className="mb-4" />
        <h1 className="text-[32px] leading-[1.05] font-semibold tracking-[-0.03em] text-[var(--color-steel)] sm:text-[44px]">
          {title}
        </h1>
        {subtitle && <p className="mt-3 max-w-2xl text-[17px] text-[var(--color-text-muted)] sm:text-lg">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-3">{actions}</div>}
    </header>
  );
}
