/*
  Home. Server component: the 3D hero (client) then the content sections as real HTML.
*/

import { Experience } from "@/components/experience/Experience";
import { Nav } from "@/components/nav/Nav";
import { Sections } from "@/components/sections";

export default function Home() {
  return (
    <>
      <Nav />
      <main className="flex-1">
        <Experience />
        <Sections />
      </main>
    </>
  );
}
