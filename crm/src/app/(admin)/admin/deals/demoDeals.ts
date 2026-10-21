import type { PipelineRow } from "./pipeline";

// Invented companies and people for `?demo` on a dev server only (page.tsx checks NODE_ENV), so the
// board can be reviewed full without touching Max's data. Never rendered in production.
export function demoPipeline(nowMs: number): PipelineRow[] {
  const ago = (days: number) => new Date(nowMs - days * 86_400_000).toISOString();
  const row = (
    id: string,
    businessName: string,
    stage: PipelineRow["deal"]["stage"],
    value: number,
    contact: string,
    nextStep: string,
    touched: number,
    notes = ""
  ): PipelineRow => ({
    deal: { id, businessName, value, stage, notes, fromLeadId: null, createdAt: ago(touched + 5) },
    contact,
    nextStep,
    nextDue: null,
    lastTouch: ago(touched),
  });
  return [
    row("d1", "Ridge Motorsport", "proposal", 48000, "Dana Reyes", "Re-price for three cars before Thursday's call", 1),
    row("d2", "Coastline Karting", "proposal", 16000, "Sofia Laurent", "Second follow-up on the proposal", 9),
    row("d3", "Apex Track Days", "inquiry", 22500, "Kevin Osei", "Intro call today at 1:00", 0),
    row("d4", "Summit Driving Club", "inquiry", 0, "Jen Takahashi", "", 2, "Site and bookings before spring"),
    row("d5", "Bell Race Prep", "negotiation", 12000, "Marcus Bell", "Call after the season finale", 16),
    row("d6", "Northline Raceway", "negotiation", 31000, "Priya Natarajan", "Send the revised scope", 4),
    row("d7", "Harbor Kart Center", "won", 18500, "Luis Ortega", "Kickoff call booked", 3),
    row("d8", "Desert Lap Club", "lost", 9000, "Amy Chen", "", 40, "Went with an in-house build"),
  ];
}
