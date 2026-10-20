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
            className={`t-small inline-flex min-h-[var(--control-height)] items-center gap-2 rounded-[2px] border px-3.5 font-medium transition-colors ${
              on
                ? "border-[var(--color-accent-border)] bg-[var(--color-accent-soft)] text-[var(--color-accent-text)]"
                : "border-[var(--color-border)] bg-[var(--color-bg-card)] text-[var(--color-text-muted)] hover:border-[var(--color-border-bright)] hover:text-[var(--color-text)]"
            }`}
          >
            <span aria-hidden="true" className={`h-2 w-2 rounded-full ${on ? "bg-[var(--color-accent)]" : "bg-[var(--color-text-dim)]"}`} />
            {f.label}
          </button>
        );
      })}
    </div>
  );
}
