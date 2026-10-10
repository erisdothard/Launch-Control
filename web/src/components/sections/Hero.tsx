import { site } from "@/content/site";
import { ButtonLink } from "@/components/ui/Button";
import { LiveryStripe } from "@/components/ui/LiveryStripe";

const { hero } = site;

/*
  The hero: real HTML, readable before any 3D arrives. The engine turns behind it (Experience owns
  the canvas); the type sits over the engine. A soft left-to-right scrim keeps the copy legible
  where it overlaps steel (90% at the left edge, 50% at the column's end, the engine still bright
  on the right); on a phone, where the type spans the full width, it is an even veil.
  No backdrop-filter.
  The section behind this (Experience) is STAGE_SCREENS tall; this one-screen frame sticks to the
  top of the window while the engine runs its stage, then scrolls away with the page.
*/
export function Hero() {
  return (
    <div className="sticky top-0 h-[100svh]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-background/60 md:bg-transparent md:bg-gradient-to-r md:from-background/90 md:via-background/65 md:to-transparent"
        style={{ opacity: "calc(0.78 + 0.22 * var(--stage-explode, 0))" }}
      />
      <div className="relative mx-auto flex h-full w-full max-w-content-max flex-col justify-center px-6 pb-32 pt-16 lg:px-12">
        <LiveryStripe className="mb-8" />
        <ul className="label-mono m-0 mb-6 flex list-none flex-wrap gap-x-3 gap-y-1 p-0 text-muted">
          {hero.eyebrow.map((item, i) => (
            <li key={item} className="flex gap-x-3">
              {item}
              {i < hero.eyebrow.length - 1 && <span aria-hidden="true" className="text-subtle">·</span>}
            </li>
          ))}
        </ul>
        <h1 id="hero-title" className="max-w-[16ch] text-hero">{hero.title}</h1>
        <p className="mt-8 max-w-[52ch] text-lead text-muted">{hero.body}</p>
        <div className="mt-10 flex flex-wrap gap-4">
          <ButtonLink href={hero.primaryCta.href}>{hero.primaryCta.label}</ButtonLink>
          <ButtonLink href={hero.secondaryCta.href} variant="secondary">
            {hero.secondaryCta.label}
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
