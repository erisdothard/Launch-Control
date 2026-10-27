"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { Role } from "@/lib/auth/roles";
import { BrandLockup } from "@/components/brand/BrandMark";
import { isOwner } from "@/lib/auth/owner";
import { WORK_LABELS } from "@/lib/store/types";

const crmItems = [
  {
    label: "Today",
    href: "/admin/dashboard",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 10h4l2.2-5.5 3.6 11 2.2-5.5H18" />
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
    label: "Pipeline",
    href: "/admin/deals",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 2v16M6 6l4-4 4 4M5 10h10" />
        <rect x="3" y="12" width="14" height="6" rx="1.5" />
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
    label: "Calendar",
    href: "/admin/calendar",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="14" height="13" rx="2" />
        <path d="M3 8h14M7 2.5v3M13 2.5v3" />
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
    label: "Campaigns",
    href: "/admin/campaigns",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 8v4h3l5 4V4L6 8z" />
        <path d="M14 7.5a3.5 3.5 0 0 1 0 5M16 5a7 7 0 0 1 0 10" />
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
];

const footItems = [
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

// Owner-only: the agent ops page. Never rendered for Max or the demo.
const opsItem = {
  label: "Agent Ops",
  href: "/admin/ops",
  icon: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2.5" y="4" width="15" height="11" rx="1.5" />
      <path d="M8.5 7.5v4l3.5-2z" />
    </svg>
  ),
};

// Saved views: the questions Max asks most, one click each (the Leads page's own views).
// Labels come from WORK_LABELS so the sidebar, Today, Inbox and Leads use the same words.
const savedViews = [
  { label: WORK_LABELS.reply, href: "/admin/leads?view=needs-reply", dot: "var(--color-hot)" },
  { label: WORK_LABELS.followup, href: "/admin/leads?view=follow-up", dot: "var(--color-warm)" },
  { label: WORK_LABELS.new, href: "/admin/leads?view=new-inquiries", dot: "var(--color-accent)" },
  { label: "Meetings & deals", href: "/admin/leads?view=in-play", dot: "var(--color-steel)" },
  { label: "Gone quiet", href: "/admin/leads?view=quiet", dot: "var(--color-text-dim)" },
];

interface AdminSidebarProps {
  role: Role;
  userEmail: string;
  companyName: string;
  logoUrl: string | null;
  unread: number;
  drafts: number;
}

// The real CRM links to the demo deployment so Max can open it in front of a client. The demo itself has no such link.
const demoUrl = process.env.NEXT_PUBLIC_DEMO_MODE === "1" ? null : (process.env.NEXT_PUBLIC_DEMO_URL ?? null);

export default function AdminSidebar({ userEmail, companyName, logoUrl, unread, drafts }: AdminSidebarProps) {
  const pathname = usePathname();
  const search = useSearchParams();
  // The Inbox badge is incoming mail nobody has opened. Drafts are counted on their own line: a
  // drafted email is work to check, not someone waiting.
  const draftsActive = pathname === "/admin/inbox" && search.get("folder") === "drafts";

  function isActive(href: string): boolean {
    if (href.includes("?")) return pathname === href.split("?")[0] && search.get("view") === new URLSearchParams(href.split("?")[1]).get("view");
    if (href === "/admin/dashboard") return pathname === "/admin/dashboard" || pathname === "/admin";
    if (href === "/admin/inbox") return pathname.startsWith(href) && !draftsActive;
    if (href === "/admin/leads") return pathname.startsWith(href) && !savedViews.some((v): boolean => isActive(v.href));
    return pathname.startsWith(href);
  }

  const itemClass = (active: boolean) =>
    `relative flex items-center gap-3 rounded-[var(--radius-sm)] px-3 py-2.5 text-[15px] transition-colors ${
      active
        ? "bg-[var(--color-bg-card)] text-[var(--color-text)] before:absolute before:top-2.5 before:bottom-2.5 before:-left-3 before:w-[3px] before:rounded-r-sm before:bg-[var(--color-steel)]"
        : "text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text)]"
    }`;

  return (
    <aside className="fixed top-0 left-0 z-40 hidden h-screen w-60 flex-col border-r border-[var(--color-border)] bg-[var(--color-bg-sidebar)] px-3 pt-5 pb-3 lg:flex">
      {/* Logo: an uploaded company logo wins; otherwise the Launch Control lockup */}
      <Link href="/admin/dashboard" className="mb-5 flex items-center gap-2.5 px-2.5">
        {logoUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- uploaded file, not worth next/image's optimization pipeline for a 28px mark */}
            <img src={logoUrl} alt="" className="h-7 w-7 shrink-0 rounded-[2px] object-cover" />
            <span className="truncate font-display text-[11px] uppercase tracking-[var(--tracking-signage)] text-[var(--color-steel)]">{companyName}</span>
          </>
        ) : (
          <BrandLockup className="text-[10.5px]" />
        )}
      </Link>

      <nav className="flex-1 overflow-y-auto" aria-label="CRM">
        <ul className="space-y-0.5">
          {crmItems.map((item) => {
            const active = isActive(item.href);
            const count = item.href === "/admin/inbox" ? unread : 0;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  aria-label={count > 0 ? `${item.label}, ${count} unread` : undefined}
                  className={itemClass(active)}
                >
                  <span className="shrink-0">{item.icon}</span>
                  {item.label}
                  {count > 0 && (
                    <span className="ml-auto rounded-full bg-[var(--color-livery-red)] px-2 text-[13px] leading-5 font-medium text-white tabular">{count}</span>
                  )}
                </Link>
                {item.href === "/admin/inbox" && drafts > 0 && (
                  <Link
                    href="/admin/inbox?folder=drafts"
                    aria-current={draftsActive ? "page" : undefined}
                    aria-label={`Drafts, ${drafts} to check`}
                    className={`flex items-center rounded-[var(--radius-sm)] py-1.5 pr-3 pl-[44px] text-[14.5px] transition-colors ${
                      draftsActive ? "bg-[var(--color-bg-card)] text-[var(--color-text)]" : "text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text)]"
                    }`}
                  >
                    Drafts
                    <span className="ml-auto px-2 text-[14px] text-[var(--color-text-dim)] tabular">{drafts}</span>
                  </Link>
                )}
              </li>
            );
          })}
        </ul>

        <p className="mt-6 mb-1.5 px-3 text-[13px] text-[var(--color-text-dim)]">Saved views</p>
        <ul className="space-y-0.5">
          {savedViews.map((v) => (
            <li key={v.href}>
              <Link href={v.href} className={itemClass(isActive(v.href))}>
                <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ background: v.dot }} />
                {v.label}
              </Link>
            </li>
          ))}
        </ul>

        <ul className="mt-6 space-y-0.5">
          {(isOwner(userEmail) ? [opsItem, ...footItems] : footItems).map((item) => (
            <li key={item.href}>
              <Link href={item.href} className={itemClass(isActive(item.href))}>
                <span className="shrink-0">{item.icon}</span>
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* Signed in as, change password, sign out */}
      <div className="mt-3 border-t border-[var(--color-border)] px-1 pt-3">
        <div className="mb-1 flex items-center gap-2.5 px-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-bg-secondary)] text-[13px] font-semibold text-[var(--color-steel)] uppercase">
            {userEmail ? userEmail[0] : "?"}
          </div>
          <p className="min-w-0 truncate text-[13px] text-[var(--color-text-muted)]">{userEmail || "Signed in"}</p>
        </div>
        {demoUrl && (
          <a href={demoUrl} target="_blank" rel="noopener noreferrer" className="mb-1 flex items-center gap-2 rounded-[var(--radius-sm)] px-2 py-2 text-[13px] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text)]">
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-[var(--color-accent)]" />
            Open the client demo
          </a>
        )}
        <div className="flex">
          <Link href="/admin/update-password" className="flex-1 rounded-[var(--radius-sm)] px-2 py-2 text-[13px] text-[var(--color-text-dim)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text)]">
            Change password
          </Link>
          <form action="/auth/signout" method="post">
            <button type="submit" className="rounded-[var(--radius-sm)] px-2 py-2 text-[13px] text-[var(--color-text-dim)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text)]">
              Sign out
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
