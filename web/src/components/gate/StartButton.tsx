"use client";

/*
  StartButton: the gate trigger. A real <button>. Round, 160px on md+, 120px on mobile.
  Face surface, 2px ember ring (3px on hover, no layout shift), label Michroma 15px
  0.08em uppercase, counter beneath in Chivo Mono 13px muted.
  Accessible name = the visible label + an sr-only sentence (no aria-label, so the name contains
  the visible text). The counter is hidden from the name and read via aria-describedby.
  States: loading (PRIMING + 000→100 counter, ring at 40%), ready (START), pressed (RUNNING,
  scales to 0 over the ignition), error (ENTER when WebGL failed).
*/

import { motion } from "framer-motion";
import { site } from "@/content/site";
import { usePhase } from "@/lib/phase";
import { IGNITION_SECONDS } from "@/lib/scrollMap";

const EASE_UI = [0.16, 1, 0.3, 1] as const;
const COUNTER_ID = "gate-counter";

export type StartButtonProps = { onPress: () => void };

export function StartButton({ onPress }: StartButtonProps) {
  const { phase, loadProgress, queued, posterReason } = usePhase();
  const loading = phase === "loading";
  const igniting = phase === "igniting";
  const error = posterReason === "no-webgl" || posterReason === "context-lost";

  const label = error
    ? site.gate.enterLabel
    : igniting
      ? site.gate.runningLabel
      : loading
        ? site.gate.primingLabel
        : site.gate.startLabel;

  const counter = String(loadProgress).padStart(3, "0");

  return (
    <motion.button
      type="button"
      data-testid="start-button"
      aria-busy={loading || undefined}
      aria-describedby={loading ? COUNTER_ID : undefined}
      onClick={onPress}
      className="group relative flex flex-col items-center justify-center rounded-round bg-surface text-text w-[120px] h-[120px] md:w-[160px] md:h-[160px] cursor-pointer select-none border-ember border-solid"
      style={{
        borderWidth: 2,
        borderColor: igniting
          ? "var(--color-danger)"
          : loading
            ? "color-mix(in oklab, var(--color-ember) 40%, transparent)"
            : "var(--color-ember)",
        transition: "border-width var(--duration-fast) var(--ease-ui), border-color var(--duration-base) var(--ease-ui)",
      }}
      whileHover={{ borderWidth: 3 }}
      whileTap={{ scale: 0.96, transition: { duration: 0.12, ease: EASE_UI } }}
      animate={igniting ? { scale: 0, transition: { duration: IGNITION_SECONDS, ease: EASE_UI } } : { scale: 1 }}
      data-queued={queued || undefined}
    >
      <span className="font-mono text-caption font-medium uppercase tracking-signage leading-none text-subtle mb-2">
        {site.gate.engineWord}
      </span>
      <span
        className="font-display uppercase text-[15px] tracking-signage leading-none"
        style={{ color: igniting ? "var(--color-danger)" : "var(--color-steel)", transition: "color var(--duration-base) var(--ease-ui)" }}
      >
        {label}
      </span>
      <span className="sr-only">{site.gate.srStart}</span>
      <span
        id={COUNTER_ID}
        className="font-mono text-caption text-muted tabular-nums mt-2 leading-none"
        aria-hidden="true"
      >
        {loading ? counter : " "}
      </span>
      {queued && (
        <span
          aria-hidden="true"
          className="absolute inset-[-6px] rounded-round border border-ember animate-ping"
          style={{ animationIterationCount: 1 }}
        />
      )}
    </motion.button>
  );
}
