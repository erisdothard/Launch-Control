"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

export interface RevealProps {
  children: ReactNode;
  className?: string;
  /** Seconds. Stagger siblings by passing a different delay. */
  delay?: number;
}

const EASE_UI: [number, number, number, number] = [0.16, 1, 0.3, 1];

/*
  In-view fade and rise, once. Always renders the same motion.div on server and client so the
  initial inline style matches during hydration; under prefers-reduced-motion the transition is
  instant instead of swapping to a different element.
*/
export function Reveal({ children, className, delay = 0 }: RevealProps) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={reduced ? { duration: 0 } : { duration: 0.6, ease: EASE_UI, delay }}
    >
      {children}
    </motion.div>
  );
}
