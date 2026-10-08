import { site } from "@/content/site";
import { Reveal } from "@/components/ui/Reveal";
import { LiveryStripe } from "@/components/ui/LiveryStripe";

const { build } = site;
const titleId = `${build.id}-title`;

/* What we build: title and intro side by side, then the services as a compact ruled grid. No cards.
   The panel is translucent black, so the engine turns faintly behind it. */
export function Build() {
  return (
    <section
      id={build.id}
      aria-labelledby={titleId}
      className="relative border-t border-border bg-background/60"
      style={{ zIndex: "var(--z-content)" }}
    >
      <div className="mx-auto max-w-content-max px-6 py-20 lg:px-12 lg:py-24">
        <Reveal className="mb-12 grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-12">
          <div className="lg:col-span-5">
            <LiveryStripe className="mb-6" />
            <h2 id={titleId} className="text-display">
              {build.title}
            </h2>
          </div>
          <p className="max-w-[60ch] text-lead text-muted lg:col-span-7 lg:self-end">{build.intro}</p>
        </Reveal>
        <ul className="m-0 grid list-none grid-cols-1 border-t border-border p-0 sm:grid-cols-2 lg:grid-cols-5">
          {build.services.map((service, index) => (
            <li
              key={service.id}
              className="border-b border-border transition-colors duration-fast ease-ui hover:bg-elevated/70 sm:border-r sm:last:border-r-0 lg:border-b-0"
            >
              <Reveal className="flex flex-col gap-3 px-0 py-6 sm:px-5" delay={0.05 * index}>
                <h3 className="font-display text-service uppercase leading-snug tracking-small-caps text-steel">
                  {service.title}
                </h3>
                <p className="text-caption text-muted">{service.body}</p>
              </Reveal>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
