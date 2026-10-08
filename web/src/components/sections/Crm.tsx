import { site } from "@/content/site";
import { Reveal } from "@/components/ui/Reveal";
import { LiveryStripe } from "@/components/ui/LiveryStripe";
import { ButtonLink } from "@/components/ui/Button";

const { crm, proof } = site;
const titleId = `${crm.id}-title`;
const { mock } = crm;

const PRIORITY_CLASS: Record<(typeof mock.briefing)[number]["priority"], string> = {
  High: "border-ember-red/60 text-ember-red",
  Medium: "border-ember-hot/60 text-ember-hot",
  Low: "border-border text-muted",
};

/* The product mock: a CRM window drawn in HTML with invented demo data. Never real client data. */
function CommandCenter() {
  return (
    <figure className="m-0 border border-border bg-surface/95">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <span className="label-mono text-steel">{mock.label}</span>
        <span className="flex gap-1.5" aria-hidden="true">
          <span className="h-2 w-2 rounded-round bg-border" />
          <span className="h-2 w-2 rounded-round bg-border" />
          <span className="h-2 w-2 rounded-round bg-border" />
        </span>
      </div>
      <div className="flex flex-col gap-5 p-5">
        <dl className="m-0 grid grid-cols-3 gap-3">
          {mock.stats.map((stat) => (
            <div key={stat.label} className="flex flex-col-reverse gap-2 border border-border bg-background/60 p-3">
              <dt className="label-mono text-[11px] text-subtle">{stat.label}</dt>
              <dd className="m-0 font-mono text-[1.5rem] leading-none tabular-nums text-text">{stat.value}</dd>
            </div>
          ))}
        </dl>
        <div>
          <p className="label-mono mb-2 text-muted">{mock.briefingTitle}</p>
          <ol className="m-0 list-none border-t border-border p-0">
            {mock.briefing.map((item, i) => (
              <li key={item.name} className="grid grid-cols-[1.25rem_1fr_auto] items-start gap-3 border-b border-border py-2.5">
                <span className="font-mono text-caption text-ember">{i + 1}</span>
                <span className="flex flex-col gap-0.5">
                  <span className="text-body text-text">
                    {item.name} <span className="text-subtle">· {item.kind}</span>
                  </span>
                  <span className="text-caption text-muted">{item.reason}</span>
                </span>
                <span className={`label-mono border px-2 py-1 text-[11px] ${PRIORITY_CLASS[item.priority]}`}>
                  {item.priority}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
      <figcaption className="label-mono border-t border-border px-5 py-3 text-[11px] text-subtle">{mock.demoNote}</figcaption>
    </figure>
  );
}

/* The featured build: the whole application as three connected layers, the agents inside its CRM
   beside a demo-data mock, then the other shipped work as linked rows. */
export function Crm() {
  return (
    <section
      id={crm.id}
      aria-labelledby={titleId}
      className="relative border-t border-border bg-background/60"
      style={{ zIndex: "var(--z-content)" }}
    >
      <div className="mx-auto max-w-content-max px-6 py-20 lg:px-12 lg:py-24">
        <Reveal className="mb-12 grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-12">
          <div className="lg:col-span-7">
            <LiveryStripe className="mb-6" />
            <p className="label-mono mb-5 text-muted">{crm.eyebrow}</p>
            <h2 id={titleId} className="text-display">
              {crm.title}
            </h2>
          </div>
          <p className="max-w-[56ch] text-lead text-muted lg:col-span-5 lg:self-end">{crm.intro}</p>
        </Reveal>

        <Reveal>
          <ol className="m-0 grid list-none grid-cols-1 border border-border bg-surface/90 p-0 lg:grid-cols-3">
            {crm.layers.map((layer) => (
              <li
                key={layer.tag}
                className="flex flex-col gap-3 border-t border-border p-6 first:border-t-0 lg:border-t-0 lg:border-l lg:first:border-l-0"
              >
                <span className="label-mono text-ember">{layer.tag}</span>
                <h3 className="font-display text-title uppercase leading-tight tracking-display text-steel">{layer.title}</h3>
                <p className="text-caption text-muted">{layer.items.join(" · ")}</p>
              </li>
            ))}
          </ol>
          <p className="label-mono mt-4 text-subtle">
            {crm.stackTitle}: <span className="text-muted">{crm.stack.join(" · ")}</span>
          </p>
        </Reveal>

        <div className="mt-16 grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-12">
          <Reveal className="flex flex-col lg:col-span-5">
            <h3 className="font-display text-title uppercase leading-tight tracking-display text-steel">{crm.agentsTitle}</h3>
            <p className="mt-5 text-body text-muted">{crm.agentsBody}</p>
            <ul className="m-0 mt-6 flex list-none flex-col gap-3 p-0">
              {crm.guarantees.map((line) => (
                <li key={line} className="flex gap-3 text-body text-text">
                  <span aria-hidden="true" className="mt-[0.6em] h-[2px] w-3 shrink-0 bg-ember" />
                  {line}
                </li>
              ))}
            </ul>
            <div className="mt-8">
              <ButtonLink href={crm.cta.href} target="_blank" rel="noopener noreferrer" variant="secondary">
                {crm.cta.label}
              </ButtonLink>
            </div>
          </Reveal>
          <Reveal className="lg:col-span-7" delay={0.1}>
            <CommandCenter />
          </Reveal>
        </div>

        <Reveal className="mt-16">
          <h3 id={proof.id} className="label-mono mb-4 scroll-mt-24 text-muted">
            {proof.title}
          </h3>
          <ul className="m-0 list-none border-b border-border p-0">
            {proof.work.map((entry) => {
              const row = (
                <>
                  <span className="font-display text-service uppercase leading-snug tracking-small-caps text-steel lg:col-span-3">
                    {entry.title}
                  </span>
                  <span className="text-body text-muted lg:col-span-7">{entry.body}</span>
                  <span className="label-mono lg:col-span-2 lg:text-right">
                    {entry.href ? (
                      <span className="text-ember group-hover:text-text">
                        {proof.visitLabel} <span aria-hidden="true">→</span>
                      </span>
                    ) : (
                      <span className="text-subtle">{entry.year}</span>
                    )}
                  </span>
                </>
              );
              const rowClass = "group grid grid-cols-1 gap-2 py-5 lg:grid-cols-12 lg:items-baseline lg:gap-8";
              return (
                <li key={entry.title} className="border-t border-border transition-colors duration-fast ease-ui hover:bg-elevated/70">
                  {entry.href ? (
                    <a href={entry.href} target="_blank" rel="noopener noreferrer" className={`${rowClass} no-underline`}>
                      {row}
                    </a>
                  ) : (
                    <div className={rowClass}>{row}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}
