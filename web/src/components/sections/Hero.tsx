import { site } from "@/content/site";
import { ButtonLink } from "@/components/ui/Button";
import { LiveryStripe } from "@/components/ui/LiveryStripe";

const { hero } = site;

/*
  The hero: real HTML, readable before any 3D arrives. The engine turns behind it (Experience owns
  the canvas); the type sits over the engine. A soft left-to-right scrim keeps the copy legible
  where it overlaps steel; on a phone, where the type spans the full width, it is an even veil.
  No backdrop-filter.
*/
export function Hero() {
  return (
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-background/45 md:bg-transparent md:bg-gradient-to-r md:from-background/75 md:via-background/20 md:to-transparent"
      />
      <div className="relative mx-auto flex min-h-[100svh] w-full max-w-content-max flex-col justify-center px-6 pb-20 pt-28 lg:px-12">
        <LiveryStripe className="mb-8" />
        <ul className="label-mono m-0 mb-6 flex list-none flex-wrap gap-x-3 gap-y-1 p-0 text-muted">
          {hero.eyebrow.map((item, i) => (
            <li key={item} className="flex gap-x-3">
              {item}
              {i < hero.eyebrow.length - 1 && <span aria-hidden="true" className="text-subtle">·</span>}
            </li>
          ))}
        </ul>
        <h1 id="hero-title" className="max-w-[17ch] text-hero leading-[1.12]">{hero.title}</h1>
        <p className="mt-8 max-w-[52ch] text-lead text-muted">{hero.body}</p>
        <div className="mt-10 flex flex-wrap gap-4">
          <ButtonLink href={hero.primaryCta.href}>{hero.primaryCta.label}</ButtonLink>
          <ButtonLink href={hero.secondaryCta.href} variant="secondary">
            {hero.secondaryCta.label}
          </ButtonLink>
        </div>
      </div>
    </>
  );
}
