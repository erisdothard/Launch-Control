"use client";

import { useEffect, useRef, useState } from "react";
import { fieldLabel, MERGE_FIELDS } from "@/lib/email/merge";

interface FieldMenuProps {
  /** Extra fields that came in with a pasted list, e.g. "industry". */
  extraFields: string[];
  onInsert: (token: string) => void;
}

// "Insert a field" menu: puts {{first_name|there}} (or any field) where the cursor was.
export default function FieldMenu({ extraFields, onInsert }: FieldMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const fields = [
    ...MERGE_FIELDS.map((f) => ({ key: f.key, label: f.label, example: f.example })),
    ...extraFields.filter((k) => !MERGE_FIELDS.some((f) => f.key === k)).map((k) => ({ key: k, label: fieldLabel(k), example: "From your list" })),
  ];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        // Keep the cursor where it is in the subject/message while the menu opens.
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((o) => !o)}
        className="btn btn-secondary btn-sm"
      >
        <span aria-hidden="true" className="font-mono text-[13px] normal-case tracking-normal">{"{ }"}</span>
        Insert field
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-2 max-h-[360px] w-[280px] overflow-y-auto rounded-[var(--radius-md)] bg-[var(--color-bg-secondary)] p-1.5 shadow-[inset_0_0_0_1px_var(--color-border-bright),0_16px_40px_rgba(0,0,0,0.5)]"
        >
          {fields.map((f) => (
            <button
              key={f.key}
              type="button"
              role="menuitem"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onInsert(f.key === "first_name" ? "{{first_name|there}}" : `{{${f.key}}}`);
                setOpen(false);
              }}
              className="flex w-full items-baseline justify-between gap-3 rounded-[var(--radius-sm)] px-3 py-2.5 text-left transition-colors hover:bg-[var(--color-bg-hover)] focus-visible:bg-[var(--color-bg-hover)]"
            >
              <span className="text-[15px] text-[var(--color-text)]">{f.label}</span>
              <span className="truncate text-[13.5px] text-[var(--color-text-dim)]">{f.example}</span>
            </button>
          ))}
          <p className="border-t border-[var(--color-border)] px-3 pt-2.5 pb-1.5 text-[13.5px] leading-snug text-[var(--color-text-dim)]">
            First name goes in as {"{{first_name|there}}"}: anyone without one gets &ldquo;there&rdquo;.
          </p>
        </div>
      )}
    </div>
  );
}
