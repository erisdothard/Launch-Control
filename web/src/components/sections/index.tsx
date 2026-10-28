// Server component tree, in the order the reference agencies use: work first (then our own CRM on film), then what we build,
// then how an engagement runs, the team, then the one call to action. Panels slide over the fixed engine canvas. Book is the only
// "use client" island.
import { Work } from "./Work";
import { Film } from "./Film";
import { Build } from "./Build";
import { Process } from "./Process";
import { Team } from "./Team";
import { Book } from "./Book";
import { Footer } from "./Footer";

export function Sections() {
  return (
    <>
      <Work />
      <Film />
      <Build />
      <Process />
      <Team />
      <Book />
      <Footer />
    </>
  );
}
