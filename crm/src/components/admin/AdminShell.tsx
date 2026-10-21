"use client";

import { usePathname } from "next/navigation";
import AdminSidebar from "./AdminSidebar";
import AdminBottomNav from "./AdminBottomNav";
import type { Role } from "@/lib/auth/roles";
import { BrandLockup } from "@/components/brand/BrandMark";
import { DemoCard, DemoStrip } from "./DemoWalkthrough";

interface AdminShellProps {
  children: React.ReactNode;
  role: Role;
  userEmail: string;
  companyName: string;
  logoUrl: string | null;
  unread: number;
  drafts: number;
  /** The demo deployment: the walkthrough strip and card, at this step (null outside the demo). */
  demo?: { step: number } | null;
}

export default function AdminShell({ children, role, userEmail, companyName, logoUrl, unread, drafts, demo = null }: AdminShellProps) {
  const pathname = usePathname();
  // Password screen renders centered, with no sidebar or bottom nav.
  const isAuthPage = pathname === "/admin/update-password";

  if (isAuthPage) {
    return (
      <div className="flex h-full w-full items-center justify-center overflow-y-auto bg-[var(--color-bg-primary)]">
        {children}
      </div>
    );
  }

  return (
    <>
      <AdminSidebar role={role} userEmail={userEmail} companyName={companyName} logoUrl={logoUrl} unread={unread} drafts={drafts} />
      <div className="relative flex flex-1 flex-col overflow-x-hidden overflow-y-auto overscroll-contain bg-[var(--color-bg-primary)] lg:ml-60">
        {/* Phones have no sidebar, so the brand rides at the top of the page */}
        <div className="relative z-10 border-b border-[var(--color-border)] bg-[var(--color-bg-card)] px-4 py-3.5 lg:hidden">
          <BrandLockup />
        </div>
        {demo && <DemoStrip companyName={companyName} step={demo.step} />}
        <div className="relative z-10 flex-1 p-4 pb-24 sm:p-6 sm:pb-24 lg:p-8 lg:pb-8">
          {children}
        </div>
      </div>
      {demo && <DemoCard step={demo.step} />}
      <AdminBottomNav role={role} userEmail={userEmail} />
    </>
  );
}
