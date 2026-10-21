"use client";

import { useEffect, useRef, useState } from "react";
import { searchContactsAction } from "@/app/(admin)/admin/inbox/actions";
import type { ContactMatch } from "@/lib/store/messages";

interface RecipientInputProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onPick?: (match: ContactMatch) => void;
  /** Offer leads by name, business or email as you type. */
  search: boolean;
  autoFocus?: boolean;
}

const DEBOUNCE_MS = 220;

// The address being typed: whatever follows the last comma.
function currentToken(value: string): string {
  return value.split(/[,;]/).pop()?.trim() ?? "";
}

export default function RecipientInput({ id, value, onChange, onPick, search, autoFocus }: RecipientInputProps) {
  const [matches, setMatches] = useState<ContactMatch[]>([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const token = currentToken(value);

  useEffect(() => {
    if (!search || token.length < 2) return;
    if (timer.current) clearTimeout(timer.current);
    let cancelled = false;
    timer.current = setTimeout(async () => {
      const found = await searchContactsAction(token);
      if (cancelled) return;
      setMatches(found);
      setHighlight(0);
      setOpen(found.length > 0);
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [token, search]);

  function pick(m: ContactMatch) {
    const parts = value.split(/[,;]/).slice(0, -1).map((p) => p.trim()).filter(Boolean);
    onChange([...parts, m.email].join(", ") + ", ");
    onPick?.(m);
    setOpen(false);
  }

  const listId = `${id}-list`;
  const visible = open && token.length >= 2 && matches.length > 0;

  return (
    <div className="relative">
      <input
        id={id}
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (!visible) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlight((h) => Math.min(h + 1, matches.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((h) => Math.max(h - 1, 0));
          } else if (e.key === "Enter" && !(e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            pick(matches[highlight]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        className="field"
        placeholder={search ? "Name, business or email" : "name@business.com"}
        autoComplete="off"
        role="combobox"
        aria-expanded={visible}
        aria-controls={listId}
        aria-autocomplete="list"
      />
      {visible && (
        <ul
          id={listId}
          role="listbox"
          className="absolute top-[calc(100%+6px)] right-0 left-0 z-30 overflow-hidden rounded-[var(--radius-md)] bg-[var(--color-bg-secondary)] py-1.5 shadow-[inset_0_0_0_1px_var(--color-border-bright),0_16px_40px_rgba(0,0,0,0.55)]"
        >
          {matches.map((m, i) => (
            <li key={m.leadId} role="option" aria-selected={i === highlight}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(m)}
                onMouseEnter={() => setHighlight(i)}
                className={`flex w-full flex-col items-start px-4 py-2.5 text-left ${i === highlight ? "bg-[var(--color-bg-hover)]" : ""}`}
              >
                <span className="text-[15px] text-[var(--color-text)]">
                  {m.name || m.businessName}
                  {m.name && <span className="text-[var(--color-text-muted)]"> · {m.businessName}</span>}
                </span>
                <span className="text-[14px] text-[var(--color-text-dim)]">{m.email}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
