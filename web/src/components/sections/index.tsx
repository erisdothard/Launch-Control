// Server component tree, in the order the reference agencies use: work first, then what we build,
// then the one call to action. Panels slide over the fixed engine canvas. Book is the only
// "use client" island.
import { Work } from "./Work";
import { Build } from "./Build";
import { Team } from "./Team";
import { Book } from "./Book";
import { Footer } from "./Footer";

export function Sections() {
  return (
    <>
      <Work />
      <Build />
      <Team />
      <Book />
      <Footer />
    </>
  );
}
