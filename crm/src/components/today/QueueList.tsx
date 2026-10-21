"use client";

import { useState } from "react";
import type { TodayItem, TodayKind } from "@/lib/store/today";
import { Avatar, money, rowLabel, TONE_BAR, TONE_TEXT } from "./shared";
import styles from "./today.module.css";

type Filter = "all" | TodayKind;

const FILTERS: { key: TodayKind; label: string }[] = [
  { key: "reply", label: "Replies" },
  { key: "followup", label: "Follow-ups" },
  { key: "new", label: "New" },
];

interface QueueListProps {
  items: TodayItem[];
  onPromote: (key: string) => void;
}

// "The other N": everything after the hero. A row's button brings that person up into the hero.
export default function QueueList({ items, onPromote }: QueueListProps) {
  const [filter, setFilter] = useState<Filter>("all");
  const counts = Object.fromEntries(FILTERS.map((f) => [f.key, items.filter((i) => i.kind === f.key).length])) as Record<TodayKind, number>;
  // A filter whose rows have all been handled falls back to everything.
  const active: Filter = filter !== "all" && counts[filter] === 0 ? "all" : filter;
  const shown = active === "all" ? items : items.filter((i) => i.kind === active);

  if (items.length === 0) return null;

  const chip = (key: Filter, label: string, n: number) => (
    <button
      key={key}
      type="button"
      aria-pressed={active === key}
      onClick={() => setFilter(key)}
      className={`rounded-[var(--radius-sm)] px-1.5 py-1 text-[14.5px] transition-colors hover:text-[var(--color-text)] ${
        active === key ? "font-medium text-[var(--color-text)]" : "text-[var(--color-text-dim)]"
      }`}
    >
      {label} {n}
    </button>
  );

  return (
    <section aria-labelledby="today-rest" className="mt-[34px]">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h2 id="today-rest" className="text-[17px] font-semibold text-[var(--color-text)]">
          The other {items.length}
        </h2>
        <div className="-mx-1.5 flex flex-wrap gap-x-3" role="group" aria-label="Filter the list">
          {chip("all", "All", items.length)}
          {FILTERS.filter((f) => counts[f.key] > 0).map((f) => chip(f.key, f.label, counts[f.key]))}
        </div>
      </div>
      <ul>
        {shown.map((item) => (
          <li
            key={item.key}
            className={`group grid grid-cols-[4px_36px_minmax(0,1fr)] items-start gap-x-4 gap-y-3 border-b border-[var(--color-border)] py-[18px] md:grid-cols-[4px_36px_minmax(0,1fr)_88px_188px] ${styles.rowIn}`}
          >
            <i aria-hidden="true" className={`row-span-2 self-stretch rounded-[2px] md:row-span-1 ${TONE_BAR[item.tone]}`} />
            <span className="mt-px">
              <Avatar name={item.name} initials={item.initials} />
            </span>
            <div className="min-w-0">
              <p className="text-[16px] font-semibold text-[var(--color-text)] group-hover:text-white">
                {item.name}
                {item.company && <span className="font-normal text-[var(--color-text-dim)]"> · {item.company}</span>}
              </p>
              <p className="mt-[3px] line-clamp-2 text-[15px] leading-[1.45] text-[var(--color-text-muted)]">{item.summary}</p>
              <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[14px] text-[var(--color-text-dim)]">
                {item.meta.map((m, i) => (
                  <span key={m} className={i === 0 ? TONE_TEXT[item.tone] : undefined}>
                    {m}
                  </span>
                ))}
              </p>
            </div>
            <div className="col-start-3 flex items-center gap-4 md:col-span-2 md:col-start-4 md:self-center">
              <span className="tabular w-[76px] shrink-0 text-[15px] md:w-[88px] text-[var(--color-text-muted)] md:text-right">{money(item.value)}</span>
              <button
                type="button"
                className="btn btn-secondary min-w-0 flex-1 px-3 md:w-[188px] md:flex-none md:px-0"
                onClick={() => onPromote(item.key)}
                aria-label={`${rowLabel(item)}: bring ${item.name} to the top`}
              >
                {rowLabel(item)}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
