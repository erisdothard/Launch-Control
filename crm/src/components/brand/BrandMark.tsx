/*
  The Grid Box mark, copied from web/src/components/ui/BrandMark.tsx (same geometry as
  public/brand/*-v1.svg). The C is a starting-grid slot, the L sits in it, and the L's foot is the
  livery stripe leaving the box. Decorative beside the wordmark, so aria-hidden.
*/
export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 126 120" className={className}>
      <polygon fill="var(--color-steel)" points="96,14 24,14 10,28 10,92 24,106 96,106 96,92 24,92 24,28 96,28" />
      <rect x="36" y="40" width="14" height="40" fill="var(--color-steel)" />
      <polygon fill="var(--color-accent)" points="36,66 77,66 68,80 36,80" />
      <polygon fill="var(--color-livery-orange)" points="80,66 105,66 96,80 71,80" />
      <polygon fill="var(--color-livery-red)" points="108,66 124,66 115,80 99,80" />
    </svg>
  );
}

/* Mark + wordmark, the site's nav lockup. */
export function BrandLockup({ className = "" }: { className?: string }) {
  return (
    <span
      className={`flex items-center gap-2.5 font-display text-[12px] uppercase tracking-[var(--tracking-signage)] text-[var(--color-steel)] ${className}`}
    >
      <BrandMark className="h-6 w-auto shrink-0" />
      Launch Control
    </span>
  );
}

/* The livery stripe: yellow, orange, red at 5:3:2, as on the site. */
export function LiveryStripe({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden="true" className={`flex h-[3px] w-24 ${className}`}>
      <span className="flex-[5] bg-[var(--color-accent)]" />
      <span className="flex-[3] bg-[var(--color-livery-orange)]" />
      <span className="flex-[2] bg-[var(--color-livery-red)]" />
    </div>
  );
}
