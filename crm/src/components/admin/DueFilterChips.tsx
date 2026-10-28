"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DUE_FILTERS, type DueFilterKey } from "@/lib/leads/dueFilter";

const TONE: Record<DueFilterKey, string> = {
  overdue: "var(--color-hot)",
  today: "var(--color-warm)",
  upcoming: "var(--color-steel)",
  none: "var(--color-text-dim)",
};

// One choice at a time in ?due=; "Any date" clears it. Counts are for the view you're in.
export default function DueFilterChips({ active, counts }: { active: DueFilterKey | null; counts: Record<DueFilterKey, number> }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function pick(key: DueFilterKey | null) {
    const sp = new URLSearchParams(searchParams.toString());
    if (key) sp.set("due", key);
    else sp.delete("due");
    router.push(`${pathname}?${sp.toString()}`);
  }

  const all = Object.values(counts).reduce((a, b) => a + b, 0);
  const chip = (on: boolean) =>
    `inline-flex min-h-[40px] shrink-0 items-center gap-2 rounded-full px-4 text-[15px] transition-colors ${
      on
        ? "bg-[var(--color-steel)]/[0.14] font-medium text-[var(--color-text)] shadow-[inset_0_0_0_1px_var(--color-steel)]"
        : "text-[var(--color-text-muted)] shadow-[inset_0_0_0_1px_var(--color-border-bright)] hover:text-[var(--color-text)] hover:shadow-[inset_0_0_0_1px_var(--color-steel)]"
    }`;

  return (
    <div className="flex items-center gap-3">
      <span className="hidden shrink-0 text-[14px] text-[var(--color-text-dim)] sm:inline">Follow-up</span>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 py-0.5" role="radiogroup" aria-label="Follow-up date">
        <button type="button" role="radio" aria-checked={active === null} onClick={() => pick(null)} className={chip(active === null)}>
          Any date <span className="tabular text-[14px] text-[var(--color-text-dim)]">{all}</span>
        </button>
        {DUE_FILTERS.map((f) => {
          const on = active === f.key;
          const n = counts[f.key];
          return (
            <button key={f.key} type="button" role="radio" aria-checked={on} onClick={() => pick(on ? null : f.key)} className={chip(on)}>
              <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: TONE[f.key] }} />
              {f.label}
              <span
                className="tabular text-[14px]"
                style={{ color: n > 0 && (f.key === "overdue" || f.key === "today") ? TONE[f.key] : "var(--color-text-dim)" }}
              >
                {n}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
