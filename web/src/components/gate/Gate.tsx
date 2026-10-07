"use client";

/*
  Gate: one object centred on empty ground (DESIGN.md layout family 1). Fixed overlay at z gate.
  Dissolves over `emphasis` once the engine is idle. Rendered only while the gate is closed.
*/

import { AnimatePresence, motion } from "framer-motion";
import { usePhase } from "@/lib/phase";
import { SkipLink } from "./SkipLink";
import { StartButton } from "./StartButton";

const EASE_UI = [0.16, 1, 0.3, 1] as const;

export type GateProps = {
  onPress: () => void;
  onSkip: () => void;
};

export function Gate({ onPress, onSkip }: GateProps) {
  const { gateOpen, phase } = usePhase();
  const igniting = phase === "igniting";
  return (
    <AnimatePresence>
      {!gateOpen && (
        <motion.div
          key="gate"
          data-testid="gate"
          className="fixed inset-0 flex items-center justify-center"
          style={{ zIndex: "var(--z-gate)" }}
          initial={{ opacity: 1, backgroundColor: "var(--color-background)" }}
          animate={{
            opacity: 1,
            backgroundColor: igniting ? "rgba(5, 8, 11, 0)" : "var(--color-background)",
            transition: { duration: 1.2, ease: EASE_UI },
          }}
          exit={{ opacity: 0, transition: { duration: 0.6, ease: EASE_UI } }}
        >
          <SkipLink onSkip={onSkip} />
          <StartButton onPress={onPress} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
