"use client";

import { usePathname } from "next/navigation";
import AdminSidebar from "./AdminSidebar";
import AdminBottomNav from "./AdminBottomNav";
import type { Role } from "@/lib/auth/roles";
import { BrandLockup } from "@/components/brand/BrandMark";

interface AdminShellProps {
  children: React.ReactNode;
  role: Role;
  userEmail: string;
  companyName: string;
  logoUrl: string | null;
  /** Items on the Today queue; shown as the badge on the Today nav item. */
  attention: number;
}

export default function AdminShell({ children, role, userEmail, companyName, logoUrl, attention }: AdminShellProps) {
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
      <AdminSidebar role={role} userEmail={userEmail} companyName={companyName} logoUrl={logoUrl} attention={attention} />
      <div className="relative flex flex-1 flex-col overflow-x-hidden overflow-y-auto overscroll-contain bg-[var(--color-bg-primary)] lg:ml-72">
        {/* Phones have no sidebar, so the brand rides at the top of the page */}
        <div className="relative z-10 flex min-h-[56px] items-center border-b border-[var(--color-border)] bg-[var(--color-bg-card)] px-4 lg:hidden">
          <BrandLockup />
        </div>
        <div className="relative z-10 flex-1 p-4 pb-28 sm:p-6 sm:pb-28 lg:p-8 lg:pb-8">{children}</div>
      </div>
      <AdminBottomNav role={role} userEmail={userEmail} attention={attention} />
    </>
  );
}
