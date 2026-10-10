import { site } from "@/content/site";
import { Reveal } from "@/components/ui/Reveal";
import { LiveryStripe } from "@/components/ui/LiveryStripe";
import { ButtonLink } from "@/components/ui/Button";
import { BrowserFrame, PhoneFrame } from "@/components/ui/Frame";
import { ScreenViewer } from "@/components/ui/ScreenViewer";

const { work } = site;
const { featured } = work;
const { crm } = featured;
const titleId = `${work.id}-title`;

/* The hero collage. On a phone only the phone capture shows (a desktop page at 27% is unreadable).
   From sm up the desktop frame shows with the phone hanging off its bottom-right corner, away from
   the copy column and off the page's headline. */
const HERO_DESK = "hidden sm:block";
const PHONE_OVERLAP = "mx-auto w-[78%] sm:absolute sm:-bottom-6 sm:right-4 sm:mx-0 sm:w-[26%] sm:max-w-[150px] lg:right-6";

/* Real admin screens, captured on a local instance seeded with invented leads (never production
   data), in the screen viewer: one frame, a list of what each screen does, arrows. */
function CrmScreens() {
  return (
    <ScreenViewer screens={crm.screens} labelledBy="work-crm-title" />
  );
}

/* Work: shown before services, the way the reference agencies do it (docs/review/agency-refs).
   The featured build gets the hero collage, the agents' three guarantees and the CRM screens.
   The others get a collage or a row of screens. */
export function Work() {
  return (
    <section id={work.id} aria-labelledby={titleId} className="relative overflow-x-clip border-t border-border bg-background/90" style={{ zIndex: "var(--z-content)" }}>
      <div className="mx-auto max-w-content-max px-6 py-16 lg:px-12 lg:py-20">
        <Reveal className="mb-10 grid grid-cols-1 gap-5 lg:grid-cols-12 lg:gap-12">
          <div className="lg:col-span-5">
            <LiveryStripe className="mb-6" />
            <h2 id={titleId} className="text-display">
              {work.title}
            </h2>
          </div>
          <p className="max-w-[56ch] text-lead text-muted lg:col-span-7 lg:self-end">{work.intro}</p>
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
              <BrowserFrame shot={featured.shots.hero} className={HERO_DESK} />
              <PhoneFrame shot={featured.shots.phone} sizes="(min-width: 640px) 150px, 78vw" className={PHONE_OVERLAP} />
            </div>
          </Reveal>



          <Reveal className="mt-12 grid grid-cols-1 gap-6 lg:mt-14 lg:grid-cols-12 lg:gap-12">
            <div className="lg:col-span-5">
              <h4 className="text-title">{featured.agents.title}</h4>
              <p className="mt-5 text-body text-muted">{featured.agents.body}</p>
            </div>
            <ul className="m-0 flex list-none flex-col gap-3 p-0 lg:col-span-7 lg:self-end">
              {featured.agents.guarantees.map((line) => (
                <li key={line} className="flex gap-3 text-body text-text">
                  <span aria-hidden="true" className="mt-[0.6em] h-[2px] w-3 shrink-0 bg-steel" />
                  {line}
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal className="mt-8 lg:mt-10" delay={0.05}>
            <p id="work-crm-title" className="label-mono mb-4 text-steel">
              {crm.title}
            </p>
            <CrmScreens />
          </Reveal>
        </article>

        {/* The rest */}
        {work.more.map((entry) => {
          const titleId = `work-${entry.client}-title`;
          const copy = (
            <div>
              <p className="label-mono mb-4 text-ember">
                {entry.client} <span className="text-subtle">· {entry.year}</span>
              </p>
              <h3 id={titleId} className="text-title">
                {entry.title}
              </h3>
              <p className="mt-5 max-w-[56ch] text-body text-muted">{entry.summary}</p>
              <div className="mt-8">
                <ButtonLink href={entry.href} target="_blank" rel="noopener noreferrer" variant="secondary">
                  {work.visitLabel}
                </ButtonLink>
              </div>
            </div>
          );
          return (
            <article key={entry.client} className="mt-14 border-t border-border pt-10 lg:mt-16 lg:pt-12" aria-labelledby={titleId}>
              {entry.screens ? (
                <Reveal>
                  <ScreenViewer screens={entry.screens} labelledBy={titleId} lead={copy} />
                </Reveal>
              ) : (
                <Reveal className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:gap-12">
                  <div className="lg:col-span-5">{copy}</div>
                  {entry.shots && (
                    <div className="relative lg:col-span-7">
                      <BrowserFrame shot={entry.shots.hero} className={HERO_DESK} />
                      <PhoneFrame shot={entry.shots.phone} sizes="(min-width: 640px) 150px, 78vw" className={PHONE_OVERLAP} />
                    </div>
                  )}
                </Reveal>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
