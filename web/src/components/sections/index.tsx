// Server component tree. The content panels slide over the fixed engine canvas.
// Book is the only "use client" island.
import { Build } from "./Build";
import { Crm } from "./Crm";
import { Book } from "./Book";
import { Footer } from "./Footer";

export function Sections() {
  return (
    <>
      <Build />
      <Crm />
      <Book />
      <Footer />
    </>
  );
}
