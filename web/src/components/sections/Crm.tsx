import { site } from "@/content/site";
import { Reveal } from "@/components/ui/Reveal";
import { LiveryStripe } from "@/components/ui/LiveryStripe";
import { ButtonLink } from "@/components/ui/Button";

const { crm } = site;
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
      <div className="flex flex-col gap-6 p-5 lg:p-6">
        <dl className="m-0 grid grid-cols-3 gap-3">
          {mock.stats.map((stat) => (
            <div key={stat.label} className="flex flex-col-reverse gap-2 border border-border bg-background/60 p-3">
              <dt className="label-mono text-[11px] text-subtle">{stat.label}</dt>
              <dd className="m-0 font-mono text-[1.75rem] leading-none tabular-nums text-text">{stat.value}</dd>
            </div>
          ))}
        </dl>
        <div>
          <p className="label-mono mb-3 text-muted">{mock.briefingTitle}</p>
          <ol className="m-0 list-none border-t border-border p-0">
            {mock.briefing.map((item, i) => (
              <li key={item.name} className="grid grid-cols-[1.5rem_1fr_auto] items-start gap-3 border-b border-border py-3">
                <span className="font-mono text-caption text-ember">{i + 1}</span>
                <span className="flex flex-col gap-1">
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
        <div>
          <p className="label-mono mb-3 text-muted">{mock.cadenceTitle}</p>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {mock.cadence.map((row) => (
              <li key={row.temp} className="grid grid-cols-[4rem_1fr] gap-3 text-caption">
                <span className="label-mono text-steel">{row.temp}</span>
                <span className="font-mono text-muted">{row.days}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <figcaption className="label-mono border-t border-border px-5 py-3 text-[11px] text-subtle">{mock.demoNote}</figcaption>
    </figure>
  );
}

/* The application as one connected system: three layers joined by arrows, then how they talk. */
function System() {
  return (
    <div className="mb-16 lg:mb-20">
      <ol className="m-0 grid list-none grid-cols-1 border border-border bg-surface/90 p-0 lg:grid-cols-[1fr_auto_1fr_auto_1fr]">
        {crm.layers.map((layer, i) => (
          <li key={layer.tag} className="contents">
            {i > 0 && (
              <span
                aria-hidden="true"
                className="flex items-center justify-center border-t border-border py-2 font-mono text-ember lg:border-t-0 lg:border-l lg:px-3 lg:py-0"
              >
                <span className="lg:hidden">↓</span>
                <span className="hidden lg:inline">⇄</span>
              </span>
            )}
            <div className="flex flex-col gap-4 p-6 lg:p-8">
              <span className="label-mono text-ember">{layer.tag}</span>
              <h3 className="font-display text-title uppercase leading-tight tracking-display text-steel">{layer.title}</h3>
              <p className="text-body text-muted">{layer.body}</p>
              <ul className="m-0 mt-2 flex list-none flex-col gap-2 border-t border-border p-0 pt-4">
                {layer.items.map((item) => (
                  <li key={item} className="flex gap-3 text-caption text-text">
                    <span aria-hidden="true" className="mt-[0.55em] h-px w-2 shrink-0 bg-subtle" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-12">
        <div className="lg:col-span-8">
          <p className="label-mono mb-4 text-muted">{crm.flowsTitle}</p>
          <ul className="m-0 list-none border-b border-border p-0">
            {crm.flows.map((flow) => (
              <li key={flow.from} className="grid grid-cols-1 gap-1 border-t border-border py-3 sm:grid-cols-[1fr_auto_1fr] sm:items-baseline sm:gap-4">
                <span className="text-body text-text">{flow.from}</span>
                <span aria-hidden="true" className="hidden font-mono text-ember sm:inline">→</span>
                <span className="text-body text-muted">{flow.to}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="lg:col-span-4">
          <p className="label-mono mb-4 text-muted">{crm.stackTitle}</p>
          <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
            {crm.stack.map((tech) => (
              <li key={tech} className="label-mono border border-border px-3 py-2 text-[11px] text-steel">
                {tech}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

/* The featured build: the whole application, then the agents inside its CRM beside a demo-data mock. */
export function Crm() {
  return (
    <section
      id={crm.id}
      aria-labelledby={titleId}
      className="relative border-t border-border bg-background/60"
      style={{ zIndex: "var(--z-content)" }}
    >
      <div className="mx-auto max-w-content-max px-6 py-section-sm lg:px-12">
        <Reveal className="mb-14 grid grid-cols-1 gap-8 lg:mb-16 lg:grid-cols-12 lg:gap-12">
          <div className="lg:col-span-7">
            <LiveryStripe className="mb-8" />
            <p className="label-mono mb-6 text-muted">{crm.eyebrow}</p>
            <h2 id={titleId} className="text-display">
              {crm.title}
            </h2>
          </div>
          <p className="max-w-[56ch] text-lead text-muted lg:col-span-5 lg:self-end">{crm.intro}</p>
        </Reveal>
        <Reveal>
          <System />
        </Reveal>
        <Reveal>
          <h3 className="mb-8 font-display text-title uppercase leading-tight tracking-display text-steel">{crm.agentsTitle}</h3>
        </Reveal>
        <div className="grid grid-cols-1 gap-14 lg:grid-cols-12 lg:gap-12">
          <Reveal className="flex flex-col lg:col-span-6">
            <ol className="m-0 list-none border-b border-border p-0">
              {crm.steps.map((step, i) => (
                <li key={step.title} className="grid grid-cols-[2.5rem_7rem_1fr] items-baseline gap-3 border-t border-border py-4">
                  <span className="font-mono text-caption text-ember">{String(i + 1).padStart(2, "0")}</span>
                  <span className="font-display text-[13px] uppercase tracking-small-caps text-steel">{step.title}</span>
                  <span className="text-body text-muted">{step.body}</span>
                </li>
              ))}
            </ol>
            <ul className="m-0 mt-8 flex list-none flex-col gap-3 p-0">
              {crm.guarantees.map((line) => (
                <li key={line} className="flex gap-3 text-body text-text">
                  <span aria-hidden="true" className="mt-[0.6em] h-[2px] w-3 shrink-0 bg-ember" />
                  {line}
                </li>
              ))}
            </ul>
            <div className="mt-10">
              <ButtonLink href={crm.cta.href} target="_blank" rel="noopener noreferrer" variant="secondary">
                {crm.cta.label}
              </ButtonLink>
            </div>
          </Reveal>
          <Reveal className="lg:col-span-6" delay={0.1}>
            <CommandCenter />
          </Reveal>
        </div>
      </div>
    </section>
  );
}
