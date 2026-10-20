"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@/lib/auth/roles";
import { BrandLockup, LiveryStripe } from "@/components/brand/BrandMark";

/*
 * The CRM's four places. Today is the work queue (and where the old dashboard, inbox, drafts and
 * tasks now send you); Leads holds Lead Gen; Deals holds Customers; Settings holds Activity and the
 * password screen. Everything else is reached from inside a page, never from the nav.
 */
export interface NavItem {
  label: string;
  href: string;
  /** Paths (prefix match) that light this item up. */
  activeOn: string[];
  icon: (size: number) => React.ReactNode;
}

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export const NAV_ITEMS: NavItem[] = [
  {
    label: "Today",
    href: "/admin/today",
    activeOn: ["/admin/today", "/admin/dashboard", "/admin/inbox", "/admin/drafts", "/admin/tasks", "/admin/calendar"],
    icon: (size) => (
      <svg width={size} height={size} viewBox="0 0 20 20" {...stroke}>
        <rect x="3" y="3" width="14" height="14" rx="1.5" />
        <path d="M6.5 10.5l2.5 2.5 4.5-5" />
      </svg>
    ),
  },
  {
    label: "Leads",
    href: "/admin/leads",
    activeOn: ["/admin/leads", "/admin/lead-gen"],
    icon: (size) => (
      <svg width={size} height={size} viewBox="0 0 20 20" {...stroke}>
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
    activeOn: ["/admin/deals", "/admin/customers"],
    icon: (size) => (
      <svg width={size} height={size} viewBox="0 0 20 20" {...stroke}>
        <rect x="2.5" y="6" width="15" height="11" rx="1.5" />
        <path d="M7 6V4.5A1.5 1.5 0 0 1 8.5 3h3A1.5 1.5 0 0 1 13 4.5V6M2.5 10.5h15" />
      </svg>
    ),
  },
  {
    label: "Settings",
    href: "/admin/settings",
    activeOn: ["/admin/settings", "/admin/activity", "/admin/update-password"],
    icon: (size) => (
      <svg width={size} height={size} viewBox="0 0 20 20" {...stroke}>
        <circle cx="10" cy="10" r="2.5" />
        <path d="M10 2.5v2M10 15.5v2M4.2 4.2l1.4 1.4M14.4 14.4l1.4 1.4M2.5 10h2M15.5 10h2M4.2 15.8l1.4-1.4M14.4 5.6l1.4-1.4" />
      </svg>
    ),
  },
];

export function isNavActive(item: NavItem, pathname: string): boolean {
  if (item.href === "/admin/today" && pathname === "/admin") return true;
  return item.activeOn.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Yellow pill with a dark number, for the Today item. */
export function NavBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      aria-label={`${count} to do`}
      className="inline-flex min-w-[1.5rem] items-center justify-center rounded-full bg-[var(--color-accent)] px-1.5 py-0.5 font-mono text-sm leading-none font-medium text-[var(--color-on-accent)]"
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

interface AdminSidebarProps {
  role: Role;
  userEmail: string;
  companyName: string;
  logoUrl: string | null;
  attention: number;
}

const footerLinkClass =
  "flex min-h-[44px] w-full items-center gap-3 rounded-[2px] px-3 text-base text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-tint-hover)] hover:text-[var(--color-text)]";

export default function AdminSidebar({ userEmail, companyName, logoUrl, attention }: AdminSidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="fixed top-0 left-0 z-40 hidden h-screen w-72 flex-col border-r border-[var(--color-border)] bg-[var(--color-bg-card)] lg:flex">
      {/* Logo: an uploaded company logo wins; otherwise the Launch Control lockup */}
      <div className="relative flex h-16 items-center border-b border-[var(--color-border)] px-5">
        <Link href="/admin/today" className="flex min-h-[44px] items-center gap-2.5">
          {logoUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- uploaded file, not worth next/image's optimization pipeline for a 28px mark */}
              <img src={logoUrl} alt="" className="h-7 w-7 shrink-0 rounded-[2px] object-cover" />
              <span className="truncate font-display text-sm uppercase tracking-[var(--tracking-signage)] text-[var(--color-steel)]">{companyName}</span>
            </>
          ) : (
            <BrandLockup />
          )}
        </Link>
        <LiveryStripe className="absolute bottom-[-2px] left-5" />
      </div>

      <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const active = isNavActive(item, pathname);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-[48px] items-center gap-3 rounded-[2px] border-l-[3px] pr-3 pl-3 text-base font-medium transition-colors ${
                    active
                      ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-text)]"
                      : "border-transparent text-[var(--color-text-muted)] hover:bg-[var(--color-tint-hover)] hover:text-[var(--color-text)]"
                  }`}
                >
                  <span className="shrink-0">{item.icon(20)}</span>
                  {item.label}
                  {item.href === "/admin/today" && (
                    <span className="ml-auto">
                      <NavBadge count={attention} />
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Who is signed in, change password, sign out */}
      <div className="border-t border-[var(--color-border)] p-3">
        <div className="flex min-h-[44px] items-center gap-3 px-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-soft)] text-sm font-semibold text-[var(--color-accent-text)] uppercase">
            {userEmail ? userEmail[0] : "?"}
          </div>
          <p className="t-small min-w-0 flex-1 truncate text-[var(--color-text-muted)]" title={userEmail}>
            {userEmail || "Signed in"}
          </p>
        </div>
        <Link href="/admin/update-password" className={footerLinkClass}>
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="7" width="10" height="7" rx="1" />
            <path d="M5 7V5a3 3 0 0 1 6 0v2" />
          </svg>
          Change password
        </Link>
        <form action="/auth/signout" method="post">
          <button type="submit" className={footerLinkClass}>
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 14H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h3M11 11l3-3-3-3M14 8H6" />
            </svg>
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
