import { site } from "@/content/site";
import { Reveal } from "@/components/ui/Reveal";
import { LiveryStripe } from "@/components/ui/LiveryStripe";
import { ButtonLink } from "@/components/ui/Button";
import { FilmPlayer } from "@/components/ui/FilmPlayer";

const { film } = site;
const titleId = `${film.id}-title`;

/* The CRM film: after the client work, our own product end to end. Title and intro side by side like
   the other sections, then the film full width in a window frame, then the call to action. */
export function Film() {
  return (
    <section id={film.id} aria-labelledby={titleId} className="relative border-t border-border bg-background/90" style={{ zIndex: "var(--z-content)" }}>
      <div className="mx-auto max-w-content-max px-6 py-16 lg:px-12 lg:py-20">
        <Reveal className="mb-10 grid grid-cols-1 gap-5 lg:grid-cols-12 lg:gap-12">
          <div className="lg:col-span-5">
            <LiveryStripe className="mb-6" />
            <h2 id={titleId} className="text-display">
              {film.title}
            </h2>
          </div>
          <p className="max-w-[56ch] text-lead text-muted lg:col-span-7 lg:self-end">{film.intro}</p>
        </Reveal>
        <Reveal delay={0.05}>
          <figure className="m-0 overflow-hidden border border-border bg-surface">
            <FilmPlayer poster={film.poster} sources={film.sources} label={film.label} />
          </figure>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <ButtonLink href={film.primaryCta.href} variant="primary">
              {film.primaryCta.label}
            </ButtonLink>
            <p className="label-mono m-0 text-subtle sm:ml-auto">{film.note}</p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
