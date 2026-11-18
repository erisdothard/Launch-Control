import type { Lead } from "@/lib/store/types";

// How warm a lead is. Max can set it by hand on the record; when he hasn't, the CRM reads it from
// what happened. A hand-set value always wins, so his call and the CRM's never disagree.
//   hot   they wrote and it's our move, or a meeting / proposal / negotiation is under way
//   warm  they have written back at some point
//   cold  no answer yet, or nobody has reached out

export type Temperature = "cold" | "warm" | "hot";

export const TEMPERATURES: readonly Temperature[] = ["hot", "warm", "cold"];

export const TEMPERATURE_LABEL: Record<Temperature, string> = { hot: "Hot", warm: "Warm", cold: "Cold" };

/** Hot first: the order lists sort in. */
export const TEMPERATURE_RANK: Record<Temperature, number> = { hot: 0, warm: 1, cold: 2 };

const IN_PLAY: readonly string[] = ["meeting", "proposal", "negotiation"];

export function parseTemperature(value: unknown): Temperature | null {
  return value === "cold" || value === "warm" || value === "hot" ? value : null;
}

type TemperatureFacts = Pick<Lead, "status" | "awaiting" | "lastReplyAt">;

/** What the CRM works out when nobody has set it. */
export function autoTemperature(lead: TemperatureFacts): Temperature {
  if (lead.awaiting === "us" || IN_PLAY.includes(lead.status)) return "hot";
  if (lead.lastReplyAt !== null || lead.status === "replied" || lead.status === "converted") return "warm";
  return "cold";
}

/** The temperature to show and sort by: Max's, or the CRM's when he hasn't set one. */
export function temperatureOf(lead: TemperatureFacts & { temperature: Temperature | null }): Temperature {
  return lead.temperature ?? autoTemperature(lead);
}
