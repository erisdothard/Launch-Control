"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Role } from "@/lib/auth/roles";

const mainTabs = [
  {
    label: "Dashboard",
    href: "/admin/dashboard",
    icon: (
      <svg width="24" height="24" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="7" height="7" rx="1" />
        <rect x="11" y="2" width="7" height="7" rx="1" />
        <rect x="2" y="11" width="7" height="7" rx="1" />
        <rect x="11" y="11" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    label: "Leads",
    href: "/admin/leads",
    icon: (
      <svg width="24" height="24" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="7" cy="6" r="3" />
        <path d="M2 17c0-3 2.5-5 5-5s5 2 5 5" />
        <circle cx="14" cy="7" r="2.5" />
        <path d="M14 11.5c2 0 4 1.5 4 4" />
      </svg>
    ),
  },
  {
    label: "Deals",
    href: "/admin/deals",
    icon: (
      <svg width="24" height="24" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 2v16M6 6l4-4 4 4M5 10h10" />
        <rect x="3" y="12" width="14" height="6" rx="1" />
      </svg>
    ),
  },
  {
    label: "Customers",
    href: "/admin/customers",
    icon: (
      <svg width="24" height="24" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="10" cy="6" r="4" />
        <path d="M3 18c0-3.5 3-6 7-6s7 2.5 7 6" />
      </svg>
    ),
  },
];

const moreLinks = [
  {
    label: "Inbox",
    href: "/admin/inbox",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 5.5h14v9H3z" />
        <path d="M3 6l7 5 7-5" />
      </svg>
    ),
  },
  {
    label: "Drafts",
    href: "/admin/drafts",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 3L8.5 11.5" />
        <path d="M17 3l-5 14-3.5-5.5L3 8z" />
      </svg>
    ),
  },
  {
    label: "Lead Gen",
    href: "/admin/lead-gen",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="9" cy="9" r="6" />
        <path d="M13.5 13.5L17.5 17.5" />
      </svg>
    ),
  },
  {
    label: "Calendar",
    href: "/admin/calendar",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="14" height="13" rx="2" />
        <path d="M3 8h14M7 2.5v3M13 2.5v3" />
      </svg>
    ),
  },
  {
    label: "Tasks",
    href: "/admin/tasks",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="14" height="14" rx="2" />
        <path d="M7 10l2 2 4-4" />
      </svg>
    ),
  },
  {
    label: "Activity Log",
    href: "/admin/activity",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3v14h14" />
        <path d="M6 14l3-4 3 2 4-6" />
      </svg>
    ),
  },
  {
    label: "Settings",
    href: "/admin/settings",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="10" cy="10" r="2.5" />
        <path d="M10 2.5v2M10 15.5v2M4.2 4.2l1.4 1.4M14.4 14.4l1.4 1.4M2.5 10h2M15.5 10h2M4.2 15.8l1.4-1.4M14.4 5.6l1.4-1.4" />
      </svg>
    ),
  },
];

export default function AdminBottomNav({ userEmail }: { role: Role; userEmail: string }) {
  const pathname = usePathname();
  // The panel is open only for the path it was opened on, so navigating closes it.
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const moreOpen = openedAt === pathname;
  const panelRef = useRef<HTMLDivElement>(null);

  function isActive(href: string) {
    if (href === "/admin/dashboard") return pathname === "/admin/dashboard" || pathname === "/admin";
    return pathname.startsWith(href);
  }

  const isMoreActive = moreLinks.some((link) => isActive(link.href));

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpenedAt(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div className="fixed right-0 bottom-0 left-0 z-50 lg:hidden" ref={panelRef}>
      {/* Slide-up panel */}
      <div
        className={`border-t border-[var(--color-border)] bg-[var(--color-bg-card)] transition-all duration-300 ease-out ${
          moreOpen ? "max-h-[32rem] overflow-y-auto" : "max-h-0 overflow-hidden border-t-0"
        }`}
      >
        <div className="px-4 py-3">
          <div className="mb-2 border-b border-[var(--color-border)] pb-2">
            <Link
              href="/admin/update-password"
              className="flex w-full items-center gap-3.5 rounded-[2px] px-4 py-3.5 text-base font-medium text-[var(--color-text-muted)] transition-colors active:bg-white/[0.05] active:text-[var(--color-text)]"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="4" y="9" width="12" height="8" rx="1" />
                <path d="M6 9V6a4 4 0 0 1 8 0v3" />
              </svg>
              Change Password
            </Link>
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="flex w-full items-center gap-3.5 rounded-[2px] px-4 py-3.5 text-base font-medium text-[var(--color-accent)] transition-colors active:bg-white/[0.05]"
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 17H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h4M13 13l4-4-4-4M17 9H7" />
                </svg>
                Sign Out
              </button>
            </form>
          </div>

          <ul className="space-y-1">
            {moreLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className={`flex items-center gap-3.5 rounded-[2px] px-4 py-3.5 text-base font-medium transition-colors ${
                    isActive(link.href)
                      ? "bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
                      : "text-[var(--color-text-muted)] active:bg-white/[0.05] active:text-[var(--color-text)]"
                  }`}
                >
                  {link.icon}
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Bottom tab bar */}
      <nav className="flex items-center justify-around border-t border-[var(--color-border)] bg-[var(--color-bg-card)] px-2 pb-[env(safe-area-inset-bottom)]">
        {mainTabs.map((tab) => {
          const active = isActive(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`relative flex min-h-[64px] min-w-[52px] flex-col items-center justify-center gap-1.5 px-3 py-2 text-[11px] font-medium transition-colors ${
                active ? "text-[var(--color-accent)]" : "text-[var(--color-text-muted)] active:text-[var(--color-text)]"
              }`}
            >
              {tab.icon}
              {tab.label}
            </Link>
          );
        })}

        <button
          type="button"
          onClick={() => setOpenedAt(moreOpen ? null : pathname)}
          className={`relative flex min-h-[64px] min-w-[52px] flex-col items-center justify-center gap-1.5 px-3 py-2 text-[11px] font-medium transition-colors ${
            moreOpen || isMoreActive ? "text-[var(--color-accent)]" : "text-[var(--color-text-muted)] active:text-[var(--color-text)]"
          }`}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            <circle cx="4" cy="10" r="2" />
            <circle cx="10" cy="10" r="2" />
            <circle cx="16" cy="10" r="2" />
          </svg>
          More
        </button>
      </nav>
    </div>
  );
}
