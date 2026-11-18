// Shown the instant a tab is clicked, while the server gathers that page. Every CRM page is live
// data, so without this the old page just sat there until the new one was ready.
export default function Loading() {
  return (
    <div role="status" aria-label="Loading" className="animate-pulse motion-reduce:animate-none">
      <div aria-hidden="true" className="flex h-[3px] w-24">
        <span className="flex-[5] bg-[var(--color-accent)]" />
        <span className="flex-[3] bg-[var(--color-livery-orange)]" />
        <span className="flex-[2] bg-[var(--color-livery-red)]" />
      </div>
      <div aria-hidden="true" className="mt-5 h-10 w-56 rounded-[var(--radius-sm)] bg-[var(--color-bg-card)]" />
      <div aria-hidden="true" className="card mt-8 divide-y divide-[var(--color-border)] overflow-hidden">
        {[0, 1, 2, 3, 4, 5].map((row) => (
          <div key={row} className="flex items-center gap-4 px-5 py-5">
            <span className="h-9 w-9 shrink-0 rounded-full bg-[var(--color-bg-secondary)]" />
            <span className="h-4 w-44 rounded bg-[var(--color-bg-secondary)]" />
            <span className="ml-auto hidden h-4 w-64 rounded bg-[var(--color-bg-secondary)] sm:block" />
          </div>
        ))}
      </div>
    </div>
  );
}
