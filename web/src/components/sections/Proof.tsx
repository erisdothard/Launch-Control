import { site } from "@/content/site";
import { Reveal } from "@/components/ui/Reveal";
import { LiveryStripe } from "@/components/ui/LiveryStripe";

const { proof } = site;
const featured = proof.work.find((entry) => entry.featured && entry.href);
const rest = proof.work.filter((entry) => entry !== featured);
const titleId = `${proof.id}-title`;

/* Layout family 6: stat strip. Rendered only when real numbers exist. */
function Stats() {
  if (proof.stats.length === 0) return null;
  return (
    <dl className="mb-12 grid grid-cols-1 border-y border-border sm:grid-cols-3">
      {proof.stats.map((stat) => (
        <div
          key={stat.label}
          className="flex flex-col gap-2 border-b border-border px-4 py-8 last:border-b-0 sm:border-r sm:border-b-0 sm:last:border-r-0"
        >
          <dd className="font-mono text-stat leading-none tabular-nums">{stat.value}</dd>
          <dt className="label-mono text-muted">{stat.label}</dt>
        </div>
      ))}
    </dl>
  );
}

/* Proof: the featured project as a large linked lead entry, then the rest as a ruled list of links. */
export function Proof() {
  return (
    <section id={proof.id} aria-labelledby={titleId} className="relative border-t border-border bg-background/60" style={{ zIndex: "var(--z-content)" }}>
      <div className="mx-auto max-w-content-max px-6 py-section-sm lg:px-12">
        <Reveal>
          <LiveryStripe className="mb-8" />
          <h2 id={titleId} className="mb-10 text-display lg:mb-12">
            {proof.title}
          </h2>
        </Reveal>
        <Stats />
        {featured && (
          <Reveal>
            <a
              href={featured.href}
              target="_blank"
              rel="noopener noreferrer"
              className="group mb-12 grid grid-cols-1 gap-6 border-y border-border py-10 no-underline transition-colors duration-fast ease-ui hover:bg-elevated/70 lg:mb-16 lg:grid-cols-12 lg:gap-8 lg:py-14"
            >
              <div className="flex flex-col gap-4 lg:col-span-5">
                <span className="label-mono text-subtle">{featured.year}</span>
                <h3 className="text-display text-steel">{featured.title}</h3>
              </div>
              <div className="flex flex-col gap-6 lg:col-span-7">
                <p className="max-w-[60ch] text-lead text-muted">{featured.body}</p>
                <span className="label-mono text-ember group-hover:text-text">
                  {proof.visitLabel} <span aria-hidden="true">→</span>
                </span>
              </div>
            </a>
          </Reveal>
        )}
        <ul className="m-0 list-none border-b border-border p-0">
          {rest.map((entry, index) => {
            const body = (
              <>
                <h3 className="font-display text-service uppercase leading-snug tracking-small-caps text-steel lg:col-span-4">
                  {entry.title}
                </h3>
                <p className="max-w-[70ch] text-body text-muted lg:col-span-6">{entry.body}</p>
                <span className="label-mono text-subtle lg:col-span-2 lg:text-right">
                  {entry.href ? (
                    <span className="text-ember group-hover:text-text">
                      {proof.visitLabel} <span aria-hidden="true">→</span>
                    </span>
                  ) : (
                    entry.year
                  )}
                </span>
              </>
            );
            const rowClass =
              "group grid grid-cols-1 gap-3 py-7 lg:grid-cols-12 lg:items-baseline lg:gap-8 lg:py-8";
            return (
              <li
                key={entry.title}
                className="border-t border-border transition-colors duration-fast ease-ui hover:bg-elevated/70"
              >
                <Reveal delay={0.05 * index}>
                  {entry.href ? (
                    <a
                      href={entry.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`${rowClass} no-underline`}
                    >
                      {body}
                    </a>
                  ) : (
                    <div className={rowClass}>{body}</div>
                  )}
                </Reveal>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
