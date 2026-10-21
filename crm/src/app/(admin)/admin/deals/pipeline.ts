import type { Deal, DealStage, Lead } from "@/lib/store/types";

// One deal plus what the board needs from the lead it came from. Pure (no server imports) so the
// client board can share the type and the stage copy.

export interface PipelineRow {
  deal: Deal;
  contact: string | null; // the lead's decision-maker, else its email
  nextStep: string; // the lead's next action, else the deal's notes
  nextDue: string | null; // the lead's follow-up date, YYYY-MM-DD
  lastTouch: string; // latest of: we emailed, they replied, deal opened
}

export const STAGE_COPY: Record<DealStage, { label: string; swatch: string }> = {
  inquiry: { label: "Inquiry", swatch: "#454c54" },
  proposal: { label: "Proposal out", swatch: "#7b838c" },
  negotiation: { label: "Negotiating", swatch: "#c6ccd3" },
  won: { label: "Won", swatch: "var(--color-success)" },
  lost: { label: "Lost", swatch: "rgba(255,255,255,0.18)" },
};

export function toPipelineRow(deal: Deal, lead: Lead | undefined): PipelineRow {
  const touches = [deal.createdAt, lead?.lastContactedAt, lead?.lastReplyAt].filter((t): t is string => Boolean(t));
  const lastTouch = touches.reduce((a, b) => (new Date(b) > new Date(a) ? b : a));
  return {
    deal,
    contact: lead?.prospect?.contactName || lead?.email || null,
    nextStep: lead?.nextAction || deal.notes,
    nextDue: lead?.followUpOn ?? null,
    lastTouch,
  };
}

const WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve"];

/** "Three" for the lede (copy rule: numbers as words). Falls back to digits past twelve. */
export function countWord(n: number): string {
  return WORDS[n] ?? String(n);
}

/** The server's clock, read once per request so every card measures staleness from the same moment. */
export function requestTime(): number {
  return Date.now();
}
