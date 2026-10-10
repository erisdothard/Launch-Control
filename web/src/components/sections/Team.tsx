import { site } from "@/content/site";
import { Reveal } from "@/components/ui/Reveal";
import { LiveryStripe } from "@/components/ui/LiveryStripe";
import { liveryText } from "@/components/ui/livery";

const { team } = site;
const titleId = `${team.id}-title`;

/* Team: the two people behind the model, type only. Same shell as the other panels so the
   engine shows faintly behind it. */
export function Team() {
  return (
    <section id={team.id} aria-labelledby={titleId} className="relative border-t border-border bg-background/80" style={{ zIndex: "var(--z-content)" }}>
      <div className="mx-auto max-w-content-max px-6 py-16 lg:px-12 lg:py-20">
        <Reveal className="mb-10 grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-12">
          <div className="lg:col-span-5">
            <LiveryStripe className="mb-6" />
            <h2 id={titleId} className="text-display">
              {team.title}
            </h2>
          </div>
          <p className="max-w-[60ch] text-balance text-lead text-muted lg:col-span-7 lg:self-end">{team.intro}</p>
        </Reveal>
        <ul className="m-0 grid list-none grid-cols-1 border-t border-border p-0 md:grid-cols-2">
          {team.people.map((person, index) => (
            <li key={person.name} className="border-b border-border md:border-r md:pr-8 md:last:border-r-0 md:last:pl-8 md:last:pr-0">
              <Reveal className="flex flex-col gap-3 py-6" delay={0.05 * index}>
                <p className={`label-mono ${liveryText(index)}`}>{person.role}</p>
                <h3 className={`text-title ${liveryText(index)}`}>{person.name}</h3>
                <p className="max-w-[44ch] text-body text-muted">{person.body}</p>
              </Reveal>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
