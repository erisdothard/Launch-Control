import { site } from "@/content/site";
import { Reveal } from "@/components/ui/Reveal";
import { LiveryStripe } from "@/components/ui/LiveryStripe";
import { ButtonLink } from "@/components/ui/Button";
import { BrowserFrame, PhoneFrame } from "@/components/ui/Frame";

const { work } = site;
const { featured } = work;
const titleId = `${work.id}-title`;
const { mock } = featured;

const PRIORITY_CLASS: Record<(typeof mock.briefing)[number]["priority"], string> = {
  High: "border-ember-red/60 text-ember-red",
  Medium: "border-ember-hot/60 text-ember-hot",
  Low: "border-border text-muted",
};

/* The CRM mock: a window drawn in HTML with invented demo data. Never real client data. */
function CommandCenter() {
  return (
    <figure className="m-0 border border-border bg-surface">
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
                <span className={`label-mono border px-2 py-1 text-[11px] ${PRIORITY_CLASS[item.priority]}`}>{item.priority}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
      <figcaption className="label-mono border-t border-border px-5 py-3 text-[11px] text-subtle">{mock.demoNote}</figcaption>
    </figure>
  );
}

/* Work: shown before services, the way the reference agencies do it (docs/review/agency-refs).
   The featured build gets real screenshots of its public pages, the system diagram and the CRM
   mock. The others get one desktop and one phone shot each. */
export function Work() {
  return (
    <section id={work.id} aria-labelledby={titleId} className="relative border-t border-border bg-background/88" style={{ zIndex: "var(--z-content)" }}>
      <div className="mx-auto max-w-content-max px-6 py-20 lg:px-12 lg:py-24">
        <Reveal className="mb-10 grid grid-cols-1 gap-5 lg:grid-cols-12 lg:gap-12">
          <div className="lg:col-span-4">
            <LiveryStripe className="mb-6" />
            <h2 id={titleId} className="text-display">
              {work.title}
            </h2>
          </div>
          <p className="max-w-[56ch] text-lead text-muted lg:col-span-8 lg:self-end">{work.intro}</p>
        </Reveal>

        {/* Featured: Hyper Racer USA */}
        <article className="border-t border-border pt-10 lg:pt-12" aria-labelledby="work-featured-title">
          <Reveal className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:gap-12">
            <div className="lg:col-span-5">
              <p className="label-mono mb-4 text-ember">
                {featured.client} <span className="text-subtle">· {featured.year}</span>
              </p>
              <h3 id="work-featured-title" className="text-title">
                {featured.title}
              </h3>
              <p className="mt-5 max-w-[56ch] text-body text-muted">{featured.summary}</p>
              <div className="mt-8">
                <ButtonLink href={featured.href} target="_blank" rel="noopener noreferrer" variant="secondary">
                  {work.visitLabel}
                </ButtonLink>
              </div>
            </div>
            <div className="relative lg:col-span-7">
              <BrowserFrame shot={featured.shots.hero} />
              <PhoneFrame shot={featured.shots.phone} className="absolute -bottom-6 -left-3 w-[26%] max-w-[150px] sm:-left-6 lg:-left-10" />
            </div>
          </Reveal>

          <Reveal className="mt-14 grid grid-cols-2 gap-4 lg:mt-16 lg:gap-6" delay={0.05}>
            {featured.shots.more.map((shot) => (
              <BrowserFrame key={shot.src} shot={shot} />
            ))}
          </Reveal>

          <Reveal className="mt-14 lg:mt-16">
            <ol className="m-0 grid list-none grid-cols-1 border border-border bg-surface/90 p-0 lg:grid-cols-3">
              {featured.layers.map((layer) => (
                <li key={layer.tag} className="flex flex-col gap-3 border-t border-border p-6 first:border-t-0 lg:border-t-0 lg:border-l lg:first:border-l-0">
                  <span className="label-mono text-ember">{layer.tag}</span>
                  <h4 className="text-service">{layer.title}</h4>
                  <p className="text-body text-muted">{layer.items.join(" · ")}</p>
                </li>
              ))}
            </ol>
            <p className="label-mono mt-4 text-subtle">
              {featured.stackTitle}: <span className="text-muted">{featured.stack.join(" · ")}</span>
            </p>
          </Reveal>

          <div className="mt-14 grid grid-cols-1 gap-10 lg:mt-16 lg:grid-cols-12 lg:gap-12">
            <Reveal className="flex flex-col lg:col-span-5">
              <h4 className="text-title">{featured.agents.title}</h4>
              <p className="mt-5 text-body text-muted">{featured.agents.body}</p>
              <ul className="m-0 mt-6 flex list-none flex-col gap-3 p-0">
                {featured.agents.guarantees.map((line) => (
                  <li key={line} className="flex gap-3 text-body text-text">
                    <span aria-hidden="true" className="mt-[0.6em] h-[2px] w-3 shrink-0 bg-ember" />
                    {line}
                  </li>
                ))}
              </ul>
            </Reveal>
            <Reveal className="lg:col-span-7" delay={0.1}>
              <CommandCenter />
            </Reveal>
          </div>
        </article>

        {/* The rest */}
        {work.more.map((entry) => (
          <article key={entry.client} className="mt-16 border-t border-border pt-10 lg:mt-20 lg:pt-12" aria-labelledby={`work-${entry.client}-title`}>
            <Reveal className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:gap-12">
              <div className="lg:col-span-5">
                <p className="label-mono mb-4 text-ember">
                  {entry.client} <span className="text-subtle">· {entry.year}</span>
                </p>
                <h3 id={`work-${entry.client}-title`} className="text-title">
                  {entry.title}
                </h3>
                <p className="mt-5 max-w-[56ch] text-body text-muted">{entry.summary}</p>
                <div className="mt-8">
                  <ButtonLink href={entry.href} target="_blank" rel="noopener noreferrer" variant="secondary">
                    {work.visitLabel}
                  </ButtonLink>
                </div>
              </div>
              <div className="relative lg:col-span-7">
                <BrowserFrame shot={entry.shots.hero} />
                <PhoneFrame shot={entry.shots.phone} className="absolute -bottom-6 -left-3 w-[26%] max-w-[150px] sm:-left-6 lg:-left-10" />
                {entry.demoNote && <p className="label-mono mt-4 text-right text-[11px] text-subtle">{entry.demoNote}</p>}
              </div>
            </Reveal>
          </article>
        ))}
      </div>
    </section>
  );
}
