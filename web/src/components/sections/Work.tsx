import { site } from "@/content/site";
import { Reveal } from "@/components/ui/Reveal";
import { LiveryStripe } from "@/components/ui/LiveryStripe";
import { ButtonLink } from "@/components/ui/Button";
import { BrowserFrame, FRAME_SIZES, PhoneFrame } from "@/components/ui/Frame";

const { work } = site;
const { featured } = work;
const { crm } = featured;
const titleId = `${work.id}-title`;

/* The phone mockup overlapping a browser frame's bottom-left corner. Inside the gutter on a phone,
   hanging past the frame from sm up. */
const PHONE_OVERLAP = "absolute -bottom-6 left-0 w-[26%] max-w-[150px] sm:-left-6 lg:-left-10";

/* Items separated by a middle dot. Each item keeps its dot glued to it, so a wrap never starts a
   line with "·". */
function DotList({ items, className = "" }: { items: readonly string[]; className?: string }) {
  return (
    <ul className={`m-0 flex list-none flex-wrap gap-x-2 gap-y-1 p-0 ${className}`}>
      {items.map((item, i) => (
        <li key={item} className="whitespace-nowrap">
          {item}
          {i < items.length - 1 && (
            <span aria-hidden="true" className="ml-2 text-subtle">
              ·
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

/* Real admin screens, captured on a local instance seeded with invented leads (never production
   data). The dashboard runs the full container width; the other screens follow two across, large
   enough that the rows of the leads list and the pipeline stay readable. */
function CrmScreens() {
  const [first, ...rest] = crm.shots;
  return (
    <figure className="m-0">
      <BrowserFrame shot={first} sizes={FRAME_SIZES.full} />
      {rest.length > 0 && (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:gap-6">
          {rest.map((shot) => (
            <BrowserFrame key={shot.src} shot={shot} sizes={FRAME_SIZES.half} />
          ))}
        </div>
      )}
      <figcaption className="label-mono mt-4 text-right text-[11px] text-subtle">{crm.note}</figcaption>
    </figure>
  );
}

/* Work: shown before services, the way the reference agencies do it (docs/review/agency-refs).
   The featured build gets real screenshots of its public pages, the system diagram, the agents and
   the CRM screens. The others get one desktop and one phone shot each. */
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
              <PhoneFrame shot={featured.shots.phone} className={PHONE_OVERLAP} />
            </div>
          </Reveal>

          <Reveal className="mt-14 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:mt-16 lg:gap-6" delay={0.05}>
            {featured.shots.more.map((shot) => (
              <BrowserFrame key={shot.src} shot={shot} sizes={FRAME_SIZES.half} />
            ))}
          </Reveal>

          <Reveal className="mt-14 lg:mt-16">
            <ol className="m-0 grid list-none grid-cols-1 border border-border bg-surface/90 p-0 lg:grid-cols-3">
              {featured.layers.map((layer) => (
                <li key={layer.tag} className="flex flex-col gap-3 border-t border-border p-6 first:border-t-0 lg:border-t-0 lg:border-l lg:first:border-l-0">
                  <span className="label-mono text-ember">{layer.tag}</span>
                  <h4 className="text-service">{layer.title}</h4>
                  <DotList items={layer.items} className="text-body text-muted" />
                </li>
              ))}
            </ol>
            <div className="label-mono mt-4 flex flex-wrap gap-x-3 gap-y-1 text-subtle">
              <span>{featured.stackTitle}:</span>
              <DotList items={featured.stack} className="text-muted" />
            </div>
          </Reveal>

          <Reveal className="mt-14 grid grid-cols-1 gap-6 lg:mt-16 lg:grid-cols-12 lg:gap-12">
            <div className="lg:col-span-5">
              <h4 className="text-title">{featured.agents.title}</h4>
              <p className="mt-5 text-body text-muted">{featured.agents.body}</p>
            </div>
            <ul className="m-0 flex list-none flex-col gap-3 p-0 lg:col-span-7 lg:self-end">
              {featured.agents.guarantees.map((line) => (
                <li key={line} className="flex gap-3 text-body text-text">
                  <span aria-hidden="true" className="mt-[0.6em] h-[2px] w-3 shrink-0 bg-ember" />
                  {line}
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal className="mt-8 lg:mt-10" delay={0.05}>
            <p className="label-mono mb-4 text-steel">{crm.title}</p>
            <CrmScreens />
          </Reveal>
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
                <PhoneFrame shot={entry.shots.phone} className={PHONE_OVERLAP} />
                {entry.demoNote && <p className="label-mono mt-4 text-right text-[11px] text-subtle">{entry.demoNote}</p>}
              </div>
            </Reveal>
          </article>
        ))}
      </div>
    </section>
  );
}
