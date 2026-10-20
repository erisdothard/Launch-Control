import type { ReactNode } from "react";

interface SectionProps {
  id: string;
  title: string;
  count: number;
  /** The one muted line an empty section collapses to. */
  empty: string;
  /** A link or note that sits at the right of the heading. */
  aside?: ReactNode;
  children: ReactNode;
}

/** A block of the Today page. With nothing in it, it is a heading and one muted line. */
export default function Section({ id, title, count, empty, aside, children }: SectionProps) {
  return (
    <section aria-labelledby={`${id}-heading`} className="mb-10">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id={`${id}-heading`} className="text-xl font-semibold text-[var(--color-steel)]">
          {title}
          {count > 0 && <span className="ml-2 font-mono text-base font-normal tabular-nums text-[var(--color-text-muted)]">{count}</span>}
        </h2>
        {aside}
      </div>
      {count === 0 ? <p className="text-[var(--color-text-dim)]">{empty}</p> : children}
    </section>
  );
}
