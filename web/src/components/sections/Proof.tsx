import { site } from "@/content/site";
import { Reveal } from "@/components/ui/Reveal";

const { proof } = site;
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

/* Layout family 5: list with dividers. Title display, body, year in mono right-aligned. */
export function Proof() {
  return (
    <section id={proof.id} aria-labelledby={titleId} className="relative my-[20svh] border-y border-border bg-surface/92" style={{ zIndex: "var(--z-content)" }}>
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 -top-16 h-16 bg-gradient-to-b from-transparent to-surface/92" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 -bottom-16 h-16 bg-gradient-to-t from-transparent to-surface/92" />
      <div className="mx-auto max-w-content-max px-6 py-section-sm lg:px-12">
        <Reveal>
          <h2 id={titleId} className="mb-10 text-title lg:mb-12">
            {proof.title}
          </h2>
        </Reveal>
        <Stats />
        <ul className="border-b border-border">
          {proof.work.map((entry, index) => {
            const body = (
              <>
                <h3 className="font-display text-service uppercase leading-snug tracking-small-caps text-steel lg:col-span-4">
                  {entry.title}
                </h3>
                <p className="max-w-[70ch] text-body text-muted lg:col-span-6">{entry.body}</p>
                <span className="label-mono text-subtle lg:col-span-2 lg:text-right">
                  {entry.year}
                </span>
              </>
            );
            const rowClass =
              "grid grid-cols-1 gap-3 py-7 lg:grid-cols-12 lg:items-baseline lg:gap-8 lg:py-8";
            return (
              <li
                key={entry.title}
                className="border-t border-border transition-colors duration-fast ease-ui hover:bg-elevated"
              >
                <Reveal delay={0.05 * index}>
                  {entry.href ? (
                    <a
                      href={entry.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`${rowClass} block`}
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
