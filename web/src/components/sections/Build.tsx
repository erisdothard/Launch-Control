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
      className="relative border-t border-border bg-background/90"
      style={{ zIndex: "var(--z-content)" }}
    >
      <div className="mx-auto max-w-content-max px-6 py-16 lg:px-12 lg:py-20">
        <Reveal className="mb-10 grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-12">
          <div className="lg:col-span-5">
            <LiveryStripe className="mb-6" />
            <h2 id={titleId} className="text-display">
              {build.title}
            </h2>
          </div>
          <p className="max-w-[60ch] text-lead text-muted lg:col-span-7 lg:self-end">{build.intro}</p>
        </Reveal>
        <ul className="m-0 grid list-none grid-cols-1 border-t border-border p-0 sm:grid-cols-2 lg:grid-cols-3">
          {build.services.map((service, index) => (
            <li
              key={service.id}
              className="border-b border-border transition-colors duration-fast ease-ui hover:bg-elevated/70 sm:border-r sm:[&:nth-child(2n)]:border-r-0 lg:[&:nth-child(2n)]:border-r lg:[&:nth-child(3n)]:border-r-0"
            >
              <Reveal className="flex flex-col gap-3 px-0 py-6 sm:px-5" delay={0.05 * index}>
                <p className="label-mono m-0 text-subtle tabular-nums">{String(index + 1).padStart(2, "0")}</p>
                <h3 className="text-title">{service.title}</h3>
                <p className="max-w-[34ch] text-pretty text-body text-muted">{service.body}</p>
              </Reveal>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
