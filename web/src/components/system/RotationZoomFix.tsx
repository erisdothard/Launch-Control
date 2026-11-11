"use client";

/*
  iPhone rotation zoom. When the phone turns, iOS keeps the old zoom if anything on the page is
  briefly wider than the new screen (the 3D canvas resizes a beat after the turn). Turning from
  sideways to upright then leaves the page zoomed in by the width ratio, cut off on both sides.
  After a rotation, if the page is left zoomed, this snaps it back to 1 by briefly capping the
  viewport scale and then restoring the normal tag, so pinch-zoom keeps working.
*/

import { useEffect } from "react";

const NORMAL = "width=device-width, initial-scale=1";
const RESET = "width=device-width, initial-scale=1, maximum-scale=1";
/** How long the cap stays on: long enough for iOS to apply it, short enough not to block pinch-zoom. */
const RESET_MS = 350;

export function RotationZoomFix() {
  useEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    const vv = window.visualViewport;
    if (!meta || !vv) return;
    let width = window.innerWidth;
    let timer: number | undefined;

    const onResize = () => {
      if (window.innerWidth === width) return; // a height-only change (toolbar, keyboard): not a turn
      width = window.innerWidth;
      window.clearTimeout(timer);
      // Let the rotation settle and the canvas resize, then check the zoom.
      timer = window.setTimeout(() => {
        if (vv.scale <= 1.01) return;
        meta.setAttribute("content", RESET);
        timer = window.setTimeout(() => meta.setAttribute("content", NORMAL), RESET_MS);
      }, RESET_MS);
    };

    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);

  return null;
}
