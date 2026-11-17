"use client";

import { useEffect, useRef, useState } from "react";
import { fieldLabel, MERGE_FIELDS } from "@/lib/email/merge";

interface FieldMenuProps {
  /** Extra fields that came in with a pasted list, e.g. "industry". */
  extraFields: string[];
  onInsert: (token: string) => void;
}

/** What goes in for each field. First name says "there" when someone has none. */
function tokenFor(key: string): string {
  return key === "first_name" ? "{{first_name|there}}" : `{{${key}}}`;
}

// "Insert name", plus a small menu for the other fields. The buttons never take focus from the
// text box, so the pill lands where the cursor was.
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
    ...MERGE_FIELDS.filter((f) => f.key !== "first_name").map((f) => ({ key: f.key, label: f.label })),
    ...extraFields.filter((k) => !MERGE_FIELDS.some((f) => f.key === k)).map((k) => ({ key: k, label: fieldLabel(k) })),
  ];

  return (
    <div ref={ref} className="relative flex items-center gap-1">
      <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => onInsert(tokenFor("first_name"))} className="btn btn-secondary btn-sm">
        Insert name
      </button>
      <button
        type="button"
        aria-label="Insert another detail"
        aria-haspopup="menu"
        aria-expanded={open}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((o) => !o)}
        className="btn btn-secondary btn-sm !px-2.5"
      >
        <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <path d="M3 4.5l3 3 3-3" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute top-full right-0 z-30 mt-2 max-h-[320px] w-[220px] overflow-y-auto rounded-[var(--radius-md)] bg-[var(--color-bg-secondary)] p-1.5 shadow-[inset_0_0_0_1px_var(--color-border-bright),0_16px_40px_rgba(0,0,0,0.5)]"
        >
          {fields.map((f) => (
            <button
              key={f.key}
              type="button"
              role="menuitem"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onInsert(tokenFor(f.key));
                setOpen(false);
              }}
              className="block w-full rounded-[var(--radius-sm)] px-3 py-2.5 text-left text-[15px] text-[var(--color-text)] transition-colors hover:bg-[var(--color-bg-hover)] focus-visible:bg-[var(--color-bg-hover)] focus-visible:outline-none"
            >
              {f.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
