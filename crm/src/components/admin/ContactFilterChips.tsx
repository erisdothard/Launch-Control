"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CONTACT_FILTERS, parseHas, type ContactFilterKey } from "@/lib/leads/contactFilter";

// Toggles in the ?has= param; every chip that is on must hold for a lead to show.
export default function ContactFilterChips() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = parseHas(searchParams.get("has") ?? undefined);

  function toggle(key: ContactFilterKey) {
    const next = active.includes(key) ? active.filter((k) => k !== key) : [...active, key];
    const sp = new URLSearchParams(searchParams.toString());
    if (next.length) sp.set("has", next.join(","));
    else sp.delete("has");
    router.push(`${pathname}?${sp.toString()}`);
  }

  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Contact details">
      {CONTACT_FILTERS.map((f) => {
        const on = active.includes(f.key);
        return (
          <button
            key={f.key}
            type="button"
            aria-pressed={on}
            onClick={() => toggle(f.key)}
            className={`inline-flex min-h-[38px] items-center gap-2 rounded-full px-3.5 text-[14px] transition-colors ${
              on
                ? "bg-[var(--color-steel)]/[0.14] font-medium text-[var(--color-text)] shadow-[inset_0_0_0_1px_var(--color-steel)]"
                : "text-[var(--color-text-muted)] shadow-[inset_0_0_0_1px_var(--color-border-bright)] hover:text-[var(--color-text)] hover:shadow-[inset_0_0_0_1px_var(--color-steel)]"
            }`}
          >
            <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${on ? "bg-[var(--color-steel)]" : "bg-[var(--color-text-dim)]"}`} />
            {f.label}
          </button>
        );
      })}
    </div>
  );
}
