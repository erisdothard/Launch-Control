"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@/lib/auth/roles";
import { BrandLockup, LiveryStripe } from "@/components/brand/BrandMark";

const crmItems = [
  {
    label: "Dashboard",
    href: "/admin/dashboard",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="7" height="7" rx="1.5" />
        <rect x="11" y="2" width="7" height="7" rx="1.5" />
        <rect x="2" y="11" width="7" height="7" rx="1.5" />
        <rect x="11" y="11" width="7" height="7" rx="1.5" />
      </svg>
    ),
  },
  {
    label: "Leads",
    href: "/admin/leads",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="7" cy="6" r="3" />
        <path d="M2 17c0-3 2.5-5 5-5s5 2 5 5" />
        <circle cx="14" cy="7" r="2.5" />
        <path d="M14 11.5c2 0 4 1.5 4 4" />
      </svg>
    ),
  },
  {
    label: "Inbox",
    href: "/admin/inbox",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 5.5h14v9H3z" />
        <path d="M3 6l7 5 7-5" />
      </svg>
    ),
  },
  {
    label: "Lead Gen",
    href: "/admin/lead-gen",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="9" cy="9" r="6" />
        <path d="M13.5 13.5L17.5 17.5" />
      </svg>
    ),
  },
  {
    label: "Customers",
    href: "/admin/customers",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="10" cy="6" r="4" />
        <path d="M3 18c0-3.5 3-6 7-6s7 2.5 7 6" />
      </svg>
    ),
  },
  {
    label: "Deals",
    href: "/admin/deals",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 2v16M6 6l4-4 4 4M5 10h10" />
        <rect x="3" y="12" width="14" height="6" rx="1.5" />
      </svg>
    ),
  },
  {
    label: "Tasks",
    href: "/admin/tasks",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="14" height="14" rx="2.5" />
        <path d="M7 10l2 2 4-4" />
      </svg>
    ),
  },
  {
    label: "Activity Log",
    href: "/admin/activity",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3v14h14" />
        <path d="M6 14l3-4 3 2 4-6" />
      </svg>
    ),
  },
  {
    label: "Settings",
    href: "/admin/settings",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="10" cy="10" r="2.5" />
        <path d="M10 2.5v2M10 15.5v2M4.2 4.2l1.4 1.4M14.4 14.4l1.4 1.4M2.5 10h2M15.5 10h2M4.2 15.8l1.4-1.4M14.4 5.6l1.4-1.4" />
      </svg>
    ),
  },
];

interface AdminSidebarProps {
  role: Role;
  userEmail: string;
  companyName: string;
  logoUrl: string | null;
  unread: number;
}

export default function AdminSidebar({ userEmail, companyName, logoUrl, unread }: AdminSidebarProps) {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/admin/dashboard") return pathname === "/admin/dashboard" || pathname === "/admin";
    return pathname.startsWith(href);
  }

  return (
    <aside className="fixed top-0 left-0 z-40 hidden h-screen w-64 flex-col border-r border-[var(--color-border)] bg-[var(--color-bg-card)] lg:flex">
      {/* Logo: an uploaded company logo wins; otherwise the Launch Control lockup */}
      <div className="relative flex h-16 items-center border-b border-[var(--color-border)] px-5">
        <Link href="/admin/dashboard" className="flex items-center gap-2.5">
          {logoUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- uploaded file, not worth next/image's optimization pipeline for a 28px mark */}
              <img src={logoUrl} alt="" className="h-7 w-7 shrink-0 rounded-[2px] object-cover" />
              <span className="truncate font-display text-[12px] uppercase tracking-[var(--tracking-signage)] text-[var(--color-steel)]">{companyName}</span>
            </>
          ) : (
            <BrandLockup />
          )}
        </Link>
        <LiveryStripe className="absolute bottom-[-2px] left-5" />
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-0.5">
          {crmItems.map((item) => {
            const active = isActive(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`flex items-center gap-3 rounded-[2px] border-l-2 px-3 py-2 text-[14px] font-medium transition-colors ${
                    active
                      ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
                      : "border-transparent text-[var(--color-text-muted)] hover:bg-white/[0.05] hover:text-[var(--color-text)]"
                  }`}
                >
                  <span className="shrink-0">{item.icon}</span>
                  {item.label}
                  {item.href === "/admin/inbox" && unread > 0 && (
                    <span className="ml-auto rounded-[2px] bg-[var(--color-accent)] px-1.5 py-0.5 font-mono text-[11px] leading-none text-[var(--color-on-accent)]">
                      {unread}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* User info, change password & sign out */}
      <div className="border-t border-[var(--color-border)] p-4">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-accent)]/15 text-xs font-semibold text-[var(--color-accent)] uppercase">
            {userEmail ? userEmail[0] : "?"}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-[var(--color-text-muted)]">{userEmail || "Signed in"}</p>
          </div>
        </div>
        <Link
          href="/admin/update-password"
          className="mb-1 flex w-full items-center gap-2 rounded-[2px] px-3 py-2 text-sm text-[var(--color-text-muted)] transition-colors hover:bg-white/[0.05] hover:text-[var(--color-text)]"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="7" width="10" height="7" rx="1" />
            <path d="M5 7V5a3 3 0 0 1 6 0v2" />
          </svg>
          Change Password
        </Link>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="flex w-full items-center gap-2 rounded-[2px] px-3 py-2 text-sm text-[var(--color-text-muted)] transition-colors hover:bg-white/[0.05] hover:text-[var(--color-text)]"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 14H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h3M11 11l3-3-3-3M14 8H6" />
            </svg>
            Sign Out
          </button>
        </form>
      </div>
    </aside>
  );
}
