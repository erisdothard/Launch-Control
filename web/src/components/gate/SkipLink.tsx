"use client";

/*
  Visually hidden "Skip the ignition" link. First in DOM order, visible on focus, z skipLink.
  Bypasses the gate and lands on the first content panel.
*/

import { site } from "@/content/site";

export type SkipLinkProps = { onSkip: () => void };

export function SkipLink({ onSkip }: SkipLinkProps) {
  const target = `#${site.build.id}`;
  return (
    <a
      href={target}
      data-testid="skip-link"
      className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:px-4 focus:py-3 bg-ember text-background label-mono"
      style={{ zIndex: "var(--z-skip-link)" }}
      onClick={() => {
        onSkip();
      }}
    >
      {site.gate.skipLabel}
    </a>
  );
}
