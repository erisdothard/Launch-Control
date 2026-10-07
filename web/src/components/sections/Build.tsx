import { site } from "@/content/site";
import { Reveal } from "@/components/ui/Reveal";

const { build, arrival } = site;
const titleId = `${build.id}-title`;

/* The first panel over the engine: the arrival statement (5/7 editorial), then the ruled list on
   the same 5/7 columns. No cards. */
export function Build() {
  return (
    <section id={build.id} aria-labelledby={titleId} className="relative my-[20svh] border-y border-border bg-surface/92" style={{ zIndex: "var(--z-content)" }}>
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 -top-16 h-16 bg-gradient-to-b from-transparent to-surface/92" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 -bottom-16 h-16 bg-gradient-to-t from-transparent to-surface/92" />
      <div className="mx-auto max-w-content-max px-6 py-section-sm lg:px-12">
        <div className="mb-16 grid grid-cols-1 gap-10 lg:mb-24 lg:grid-cols-12 lg:gap-8">
          <Reveal className="lg:col-span-5">
            <h2 id={titleId} className="text-display">
              {arrival.statement}
            </h2>
          </Reveal>
          <Reveal className="flex flex-col gap-6 lg:col-span-7 lg:pt-3" delay={0.1}>
            {arrival.paragraphs.map((paragraph) => (
              <p key={paragraph} className="max-w-[60ch] text-lead text-muted">
                {paragraph}
              </p>
            ))}
          </Reveal>
        </div>
        <Reveal>
          <h3 className="mb-8 font-display text-title uppercase leading-none tracking-display text-steel">
            {build.title}
          </h3>
        </Reveal>
        <ul className="border-b border-border">
          {build.services.map((service, index) => {
            return (
              <li
                key={service.id}
                className="group border-t border-border transition-colors duration-fast ease-ui hover:bg-elevated"
              >
                <Reveal
                  className="grid grid-cols-1 gap-3 py-7 lg:grid-cols-12 lg:gap-8 lg:py-8"
                  delay={0.05 * index}
                >
                  <h4 className="font-display text-service uppercase leading-snug tracking-small-caps text-steel lg:col-span-5">
                    {service.title}
                  </h4>
                  <p className="max-w-[70ch] text-body text-muted lg:col-span-7">
                    {service.body}
                  </p>
                </Reveal>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
