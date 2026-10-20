"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@/lib/auth/roles";
import { NAV_ITEMS, NavBadge, isNavActive } from "./AdminSidebar";

interface AdminBottomNavProps {
  role: Role;
  userEmail: string;
  attention: number;
}

/* Phone tab bar: the same four places as the sidebar, nothing hidden behind a "More" panel. */
export default function AdminBottomNav({ attention }: AdminBottomNavProps) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main"
      className="fixed right-0 bottom-0 left-0 z-50 flex items-stretch justify-around border-t border-[var(--color-border)] bg-[var(--color-bg-card)] px-1 pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      {NAV_ITEMS.map((item) => {
        const active = isNavActive(item, pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`relative flex min-h-[64px] flex-1 flex-col items-center justify-center gap-1 px-2 py-2 text-sm font-medium transition-colors ${
              active ? "text-[var(--color-text)]" : "text-[var(--color-text-muted)] active:bg-[var(--color-tint-hover)] active:text-[var(--color-text)]"
            }`}
          >
            {active && <span aria-hidden="true" className="absolute top-0 left-3 right-3 h-[3px] bg-[var(--color-accent)]" />}
            <span className="relative">
              {item.icon(24)}
              {item.href === "/admin/today" && attention > 0 && (
                <span className="absolute -top-2 -right-4">
                  <NavBadge count={attention} />
                </span>
              )}
            </span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
