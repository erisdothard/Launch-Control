import { site } from "@/content/site";
import { Reveal } from "@/components/ui/Reveal";
import { LiveryStripe } from "@/components/ui/LiveryStripe";
import { liveryBg, liveryText } from "@/components/ui/livery";

const { process } = site;
const titleId = `${process.id}-title`;

/* How an engagement runs: four stages in one row, read left to right along a single rule, each
   stage numbered in the livery colours. Concise and visual (Max, 2026-10-21), not a new chapter:
   the whole section fits well inside one window. Stacks to a column on a phone. */
export function Process() {
  return (
    <section
      id={process.id}
      aria-labelledby={titleId}
      className="relative border-t border-border bg-surface/90"
      style={{ zIndex: "var(--z-content)" }}
    >
      <div className="mx-auto max-w-content-max px-6 py-16 lg:px-12 lg:py-20">
        <Reveal className="mb-10 grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-12">
          <div className="lg:col-span-5">
            <LiveryStripe className="mb-6" />
            <h2 id={titleId} className="text-display">
              {process.title}
            </h2>
          </div>
          <p className="max-w-[60ch] text-lead text-muted lg:col-span-7 lg:self-end">{process.intro}</p>
        </Reveal>
        <ol className="m-0 grid list-none grid-cols-1 gap-y-6 p-0 sm:grid-cols-2 sm:gap-x-8 lg:grid-cols-4 lg:gap-x-10">
          {process.steps.map((step, index) => (
            <li key={step.id} className="relative border-t border-border pt-6">
              {/* The stage's tick on the rule, in its livery colour. */}
              <span aria-hidden="true" className={`absolute -top-px left-0 h-[3px] w-10 ${liveryBg(index)}`} />
              <Reveal className="flex flex-col gap-3" delay={0.06 * index}>
                <p className={`label-mono m-0 flex items-center gap-3 tabular-nums ${liveryText(index)}`}>
                  {String(index + 1).padStart(2, "0")}
                  {index < process.steps.length - 1 && (
                    <svg aria-hidden="true" width="14" height="10" viewBox="0 0 14 10" fill="none" stroke="currentColor" strokeWidth="1.4" className="hidden text-subtle sm:block">
                      <path d="M0 5h12M8 1l4 4-4 4" />
                    </svg>
                  )}
                </p>
                <h3 className="text-title">{step.title}</h3>
                <p className="max-w-[30ch] text-pretty text-body text-muted">{step.body}</p>
              </Reveal>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
