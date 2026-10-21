/*
  The Grid Box mark (Eris, 2026-10-09): the C is a starting-grid slot, the L sits in it, and the L's
  foot is the livery stripe leaving the box with slanted cuts. Decorative beside the wordmark, so it
  is aria-hidden; the wordmark text carries the name. Same geometry as public/brand/*-v2.svg.
*/
export const BRAND_MARK_VIEWBOX = "0 0 126 120";
export const BRAND_MARK_C = "96,14 24,14 10,28 10,92 24,106 96,106 96,92 24,92 24,28 96,28";

export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox={BRAND_MARK_VIEWBOX} className={className}>
      <polygon fill="var(--color-steel)" points={BRAND_MARK_C} />
      <rect x="36" y="40" width="14" height="40" fill="var(--color-steel)" />
      <polygon fill="var(--color-livery-green)" points="36,66 77,66 68,80 36,80" />
      <polygon fill="var(--color-ember)" points="80,66 105,66 96,80 71,80" />
      <polygon fill="var(--color-ember-red)" points="108,66 124,66 115,80 99,80" />
    </svg>
  );
}
