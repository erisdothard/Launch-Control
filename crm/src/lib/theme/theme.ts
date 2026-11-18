// Each person's colours: a background and a highlight. Everything else (the four surface steps,
// the text on a highlighted button) is worked out from those two, inside limits that keep the
// CRM's light text readable. Pure functions: the layout, the settings screen and the tests share them.

export interface Theme {
  /** The page colour, as #rrggbb. The sidebar, cards and inputs are steps either side of it. */
  background: string;
  /** The highlight: the one main button on a screen, focus rings, the unread dot. */
  accent: string;
}

/** The CRM as designed (src/styles/tokens.css). */
export const DEFAULT_THEME: Theme = { background: "#0a0c0e", accent: "#f0c419" };

export const BACKGROUND_PRESETS: readonly { name: string; value: string }[] = [
  { name: "Graphite", value: DEFAULT_THEME.background },
  { name: "Emerald", value: "#07140e" },
  { name: "Viridian", value: "#061514" },
  { name: "Midnight", value: "#080c16" },
  { name: "Carbon", value: "#0b0b0b" },
];

export const ACCENT_PRESETS: readonly { name: string; value: string }[] = [
  { name: "Yellow", value: DEFAULT_THEME.accent },
  { name: "Orange", value: "#f07d1a" },
  { name: "Lime", value: "#b6e04a" },
  { name: "Ice", value: "#8fd3f4" },
  { name: "Silver", value: "#c6ccd3" },
];

// Limits. The page stays dark enough that --color-text-dim (#9aa2ab) keeps 4.5:1 on the lightest
// surface (inputs), and the highlight stays light enough to read as a mark on the page.
const MAX_PAGE_LIGHTNESS = 0.1;
const MIN_PAGE_LIGHTNESS = 0.025;
const MAX_PAGE_SATURATION = 0.6;
const MIN_ACCENT_LIGHTNESS = 0.5;
const MAX_ACCENT_LIGHTNESS = 0.82;

/** Lightness of each surface relative to the page, from the designed four-step ladder. */
const SURFACE_STEPS = { sidebar: -0.02, primary: 0, card: 0.033, secondary: 0.065 } as const;

const HEX = /^#[0-9a-f]{6}$/i;
const INK_DARK = "#0a0b0c";
const INK_LIGHT = "#ffffff";

interface Hsl {
  h: number;
  s: number;
  l: number;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function toRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function toHsl(hex: string): Hsl {
  const [r, g, b] = toRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s, l };
}

export function toHex({ h, s, l }: Hsl): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return `#${[r, g, b].map((v) => Math.round(clamp(v + m, 0, 1) * 255).toString(16).padStart(2, "0")).join("")}`;
}

function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two #rrggbb colours. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** A saved or submitted theme, checked. Anything malformed is null (the default look). */
export function parseTheme(value: unknown): Theme | null {
  if (typeof value !== "object" || value === null) return null;
  const { background, accent } = value as Record<string, unknown>;
  if (typeof background !== "string" || typeof accent !== "string" || !HEX.test(background) || !HEX.test(accent)) return null;
  return { background: background.toLowerCase(), accent: accent.toLowerCase() };
}

// Measured, not assumed: HSL lightness is not how bright a colour looks (a pure green at 10% is far
// brighter than a blue at 10%), so after the first clamp each colour is stepped until the real
// contrast ratios hold.
const TEXT_DIM = "#9aa2ab"; // the faintest ink the CRM uses (tokens.css)
const MIN_TEXT_CONTRAST = 4.6; // AA for body text, with a little room for rounding to 8-bit hex
const MIN_MARK_CONTRAST = 3.2; // AA for marks and large text
const STEP = 0.005;

const surfaceOf = (page: Hsl, step: number) => toHex({ h: page.h, s: page.s, l: clamp(page.l + step, 0.012, 0.2) });
const inkOn = (colour: string) => (contrast(colour, INK_DARK) >= contrast(colour, INK_LIGHT) ? INK_DARK : INK_LIGHT);

/** The colours actually used: the pick, pulled inside the limits above. */
export function normalizeTheme(theme: Theme): Theme {
  const picked = toHsl(theme.background);
  let page: Hsl = { h: picked.h, s: clamp(picked.s, 0, MAX_PAGE_SATURATION), l: clamp(picked.l, MIN_PAGE_LIGHTNESS, MAX_PAGE_LIGHTNESS) };
  // Darken until the faintest ink reads on the lightest surface (inputs and wells).
  while (page.l > MIN_PAGE_LIGHTNESS && contrast(TEXT_DIM, surfaceOf(page, SURFACE_STEPS.secondary)) < MIN_TEXT_CONTRAST) {
    page = { ...page, l: Math.max(MIN_PAGE_LIGHTNESS, page.l - STEP) };
  }
  const lightest = surfaceOf(page, SURFACE_STEPS.secondary);

  const pick = toHsl(theme.accent);
  let accent: Hsl = { h: pick.h, s: pick.s, l: clamp(pick.l, MIN_ACCENT_LIGHTNESS, MAX_ACCENT_LIGHTNESS) };
  // Lighten until it reads as a mark on the page and button text reads on it.
  const reads = (a: Hsl) => {
    const hex = toHex(a);
    return contrast(hex, lightest) >= MIN_MARK_CONTRAST && contrast(hex, inkOn(hex)) >= MIN_TEXT_CONTRAST;
  };
  while (accent.l < 0.95 && !reads(accent)) accent = { ...accent, l: accent.l + STEP };

  return { background: toHex(page), accent: toHex(accent) };
}

export function isDefaultTheme(theme: Theme): boolean {
  return theme.background === DEFAULT_THEME.background && theme.accent === DEFAULT_THEME.accent;
}

/** The CSS variables a theme sets. Only the names tokens.css already defines, so nothing else moves. */
export function themeVars(theme: Theme): Record<string, string> {
  const t = normalizeTheme(theme);
  const page = toHsl(t.background);
  const surface = (step: number) => surfaceOf(page, step);
  const [r, g, b] = toRgb(t.accent);
  return {
    "--color-bg-sidebar": surface(SURFACE_STEPS.sidebar),
    "--color-bg-primary": surface(SURFACE_STEPS.primary),
    "--color-bg-card": surface(SURFACE_STEPS.card),
    "--color-bg-secondary": surface(SURFACE_STEPS.secondary),
    "--color-accent": t.accent,
    "--color-on-accent": inkOn(t.accent),
    "--color-accent-border": `rgba(${r}, ${g}, ${b}, 0.35)`,
  };
}

/** `:root{...}` for a <style> tag. Every value comes out of themeVars, never from raw input. */
export function themeCss(theme: Theme): string {
  const body = Object.entries(themeVars(theme))
    .map(([name, value]) => `${name}:${value}`)
    .join(";");
  return `:root:root{${body}}`;
}
