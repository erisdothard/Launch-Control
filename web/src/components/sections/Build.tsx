import { site } from "@/content/site";
import { Reveal } from "@/components/ui/Reveal";
import { LiveryStripe } from "@/components/ui/LiveryStripe";

const { build } = site;
const titleId = `${build.id}-title`;

/* What we build: title and intro on a 5/7 editorial split, then the ruled service list on the same
   columns. No cards. The panel is translucent black, so the engine turns faintly behind it. */
export function Build() {
  return (
    <section
      id={build.id}
      aria-labelledby={titleId}
      className="relative border-t border-border bg-background/60"
      style={{ zIndex: "var(--z-content)" }}
    >
      <div className="mx-auto max-w-content-max px-6 py-section-sm lg:px-12">
        <div className="mb-16 grid grid-cols-1 gap-10 lg:mb-20 lg:grid-cols-12 lg:gap-8">
          <Reveal className="lg:col-span-5">
            <LiveryStripe className="mb-8" />
            <h2 id={titleId} className="text-display">
              {build.title}
            </h2>
          </Reveal>
          <Reveal className="lg:col-span-7 lg:pt-14" delay={0.1}>
            <p className="max-w-[60ch] text-lead text-muted">{build.intro}</p>
          </Reveal>
        </div>
        <ul className="m-0 list-none border-b border-border p-0">
          {build.services.map((service, index) => (
            <li
              key={service.id}
              className="group border-t border-border transition-colors duration-fast ease-ui hover:bg-elevated/70"
            >
              <Reveal
                className="grid grid-cols-1 gap-3 py-7 lg:grid-cols-12 lg:gap-8 lg:py-8"
                delay={0.05 * index}
              >
                <h3 className="font-display text-service uppercase leading-snug tracking-small-caps text-steel lg:col-span-5">
                  {service.title}
                </h3>
                <p className="max-w-[70ch] text-body text-muted lg:col-span-7">{service.body}</p>
              </Reveal>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
