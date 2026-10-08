/*
  Read design tokens at runtime so the 3D scene uses the same colours as the DOM.
  Tailwind v4 @theme emits every token as a CSS custom property on :root.
  Fallbacks are the DESIGN.md hex values, used only before the stylesheet is live (SSR / tests).
*/

const FALLBACK: Record<string, string> = {
  "--color-background": "#050607",
  "--color-surface": "#0b0d10",
  "--color-elevated": "#15181c",
  "--color-border": "#262b31",
  "--color-text": "#f4f6f8",
  "--color-steel": "#c6ccd3",
  "--color-muted": "#a7adb4",
  "--color-subtle": "#7a8189",
  "--color-ember": "#f0c419",
  "--color-ember-hot": "#f07d1a",
  "--color-ember-red": "#e3261d",
  "--color-white-hot": "#ffffff",
  "--color-info": "#9ec5e8",
  "--color-danger": "#e3261d",
};

const cache = new Map<string, string>();

export function cssToken(name: keyof typeof FALLBACK | string): string {
  const hit = cache.get(name);
  if (hit) return hit;
  let v = "";
  if (typeof document !== "undefined") {
    v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }
  const out = v || FALLBACK[name] || "#ffffff";
  cache.set(name, out);
  return out;
}

export const token = {
  danger: () => cssToken("--color-danger"),
  background: () => cssToken("--color-background"),
  surface: () => cssToken("--color-surface"),
  elevated: () => cssToken("--color-elevated"),
  border: () => cssToken("--color-border"),
  text: () => cssToken("--color-text"),
  muted: () => cssToken("--color-muted"),
  subtle: () => cssToken("--color-subtle"),
  ember: () => cssToken("--color-ember"),
  emberHot: () => cssToken("--color-ember-hot"),
  emberRed: () => cssToken("--color-ember-red"),
  whiteHot: () => cssToken("--color-white-hot"),
};
