"use client";

import { useCallback, useState } from "react";
import { usePathname } from "next/navigation";
import AdminSidebar from "./AdminSidebar";
import AdminBottomNav from "./AdminBottomNav";
import type { Role } from "@/lib/auth/roles";
import { BrandLockup } from "@/components/brand/BrandMark";
import { DemoCard, DemoStrip } from "./DemoWalkthrough";
import type { NavKey } from "@/lib/nav/order";
import { NAV_COOKIE, NAV_COOKIE_MAX_AGE, NAV_WIDTH_COLLAPSED, NAV_WIDTH_OPEN } from "@/lib/nav/collapse";

interface AdminShellProps {
  children: React.ReactNode;
  role: Role;
  userEmail: string;
  companyName: string;
  logoUrl: string | null;
  unread: number;
  drafts: number;
  /** Draft campaigns waiting for approval; badges Campaigns. */
  approvals?: number;
  /** Per-user nav order: the user id keys the browser copy; navOrder is the server copy (or null). */
  userId: string;
  navOrder: NavKey[] | null;
  /** The demo deployment: the walkthrough strip and card, at this step (null outside the demo). */
  demo?: { step: number } | null;
  /** The sidebar was left collapsed (read from a cookie, so the first paint is already right). */
  navCollapsed?: boolean;
}


export default function AdminShell({ children, role, userEmail, companyName, logoUrl, unread, drafts, approvals = 0, userId, navOrder, demo = null, navCollapsed = false }: AdminShellProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(navCollapsed);
  const toggleNav = useCallback(() => {
    setCollapsed((was) => {
      const next = !was;
      document.cookie = `${NAV_COOKIE}=${next ? "collapsed" : "open"}; path=/; max-age=${NAV_COOKIE_MAX_AGE}; samesite=lax`;
      return next;
    });
  }, []);
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
    // display: contents, so the layout's flex row is unchanged; --nav-w is the sidebar's width for
    // the page's left margin and for anything fixed that must clear it (the Leads action bar).
    <div className="contents" style={{ "--nav-w": collapsed ? NAV_WIDTH_COLLAPSED : NAV_WIDTH_OPEN } as React.CSSProperties}>
      <AdminSidebar role={role} userEmail={userEmail} companyName={companyName} logoUrl={logoUrl} unread={unread} drafts={drafts} approvals={approvals} userId={userId} navOrder={navOrder} collapsed={collapsed} onToggle={toggleNav} />
      <div className="relative flex flex-1 flex-col overflow-x-hidden overflow-y-auto overscroll-contain bg-[var(--color-bg-primary)] shell:ml-[var(--nav-w)]">
        {/* Phones have no sidebar, so the brand rides at the top of the page */}
        <div className="relative z-10 border-b border-[var(--color-border)] bg-[var(--color-bg-card)] px-4 py-3.5 shell:hidden">
          <BrandLockup />
        </div>
        {demo && <DemoStrip companyName={companyName} step={demo.step} />}
        <div className="relative z-10 flex-1 p-4 pb-24 sm:p-6 sm:pb-24 shell:p-8 shell:pb-8">
          {children}
        </div>
      </div>
      {demo && <DemoCard step={demo.step} />}
      <AdminBottomNav role={role} userEmail={userEmail} userId={userId} navOrder={navOrder} />
    </div>
  );
}
