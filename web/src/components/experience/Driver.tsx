"use client";

/*
  Driver: hands R3F's `advance` to the single loop in lib/loop.ts.
  The Canvas has frameloop="never"; nothing in R3F requests animation frames.
*/

import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import { setAdvance } from "@/lib/loop";

export function Driver() {
  const advance = useThree((s) => s.advance);
  useEffect(() => {
    setAdvance((ms) => advance(ms));
    advance(performance.now());
    return () => setAdvance(null);
  }, [advance]);
  return null;
}
