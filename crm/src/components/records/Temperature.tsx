"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { autoTemperature, temperatureOf, TEMPERATURES, TEMPERATURE_LABEL, type Temperature } from "@/lib/leads/temperature";
import type { Lead } from "@/lib/store/types";
import { setTemperatureAction } from "@/app/(admin)/admin/leads/actions";

// Hot / warm / cold as one small mark. Hot uses the "our move" red, warm the amber, cold stays
// neutral, so a column of them reads at a glance without turning into confetti.

const TONE: Record<Temperature, { pill: string; dot: string }> = {
  hot: { pill: "bg-[var(--color-hot)]/[0.12] text-[var(--color-hot)]", dot: "bg-[var(--color-hot)]" },
  warm: { pill: "bg-[var(--color-warm)]/[0.12] text-[var(--color-warm)]", dot: "bg-[var(--color-warm)]" },
  cold: { pill: "bg-white/[0.06] text-[var(--color-text-muted)]", dot: "bg-[var(--color-text-dim)]" },
};

type TemperatureLead = Pick<Lead, "status" | "awaiting" | "lastReplyAt" | "temperature">;

export function TemperatureBadge({ lead }: { lead: TemperatureLead }) {
  const value = temperatureOf(lead);
  const tone = TONE[value];
  return (
    <span className={`inline-flex items-center gap-2 rounded-full py-1 pr-3 pl-2.5 text-sm leading-none font-medium whitespace-nowrap ${tone.pill}`}>
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
      {TEMPERATURE_LABEL[value]}
    </span>
  );
}

const AUTO = "auto";

/** The same mark as a control: pick hot, warm or cold, or hand it back to the CRM. */
export function TemperaturePicker({ lead }: { lead: TemperatureLead & Pick<Lead, "id"> }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);
  // Shown straight away; the server's answer replaces it on refresh.
  const [picked, setPicked] = useState<Temperature | null | undefined>(undefined);
  const manual = picked === undefined ? lead.temperature : picked;
  const shown = manual ?? autoTemperature(lead);
  const tone = TONE[shown];

  function choose(value: string) {
    const next = value === AUTO ? null : (value as Temperature);
    setFailed(false);
    setPicked(next);
    startTransition(async () => {
      const result = await setTemperatureAction(lead.id, next);
      if (!result.ok) {
        setPicked(undefined);
        setFailed(true);
        return;
      }
      router.refresh();
    });
  }

  return (
    <label className={`relative inline-flex items-center gap-2 rounded-full py-1 pr-2 pl-2.5 text-sm leading-none font-medium ${tone.pill} ${pending ? "opacity-70" : ""}`}>
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
      <span className="sr-only">Temperature</span>
      <span aria-hidden="true">{TEMPERATURE_LABEL[shown]}</span>
      <svg aria-hidden="true" width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3.5 5.5L7 9l3.5-3.5" />
      </svg>
      <select
        value={manual ?? AUTO}
        onChange={(e) => choose(e.target.value)}
        disabled={pending}
        aria-invalid={failed || undefined}
        title={failed ? "That didn't save. Try again." : manual ? "Set by you" : "Set by the CRM"}
        className="absolute inset-0 cursor-pointer appearance-none rounded-full opacity-0"
      >
        {TEMPERATURES.map((t) => (
          <option key={t} value={t}>
            {TEMPERATURE_LABEL[t]}
          </option>
        ))}
        <option value={AUTO}>Automatic ({TEMPERATURE_LABEL[autoTemperature(lead)]})</option>
      </select>
    </label>
  );
}
