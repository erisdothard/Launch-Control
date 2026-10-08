/*
  Home. Server component: the hero over the engine (client canvas), then the content sections as
  real HTML. The engine stays fixed behind the whole page.
*/

import { Experience } from "@/components/experience/Experience";
import { Nav } from "@/components/nav/Nav";
import { Hero } from "@/components/sections/Hero";
import { Clients } from "@/components/sections/Clients";
import { Sections } from "@/components/sections";

export default function Home() {
  return (
    <>
      <Nav />
      <main className="flex-1">
        <Experience>
          <Hero />
        </Experience>
        <Clients />
        <Sections />
      </main>
    </>
  );
}
