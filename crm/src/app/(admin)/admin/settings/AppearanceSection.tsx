"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ACCENT_PRESETS, BACKGROUND_PRESETS, DEFAULT_THEME, isDefaultTheme, normalizeTheme, themeVars, toHex, toHsl, type Theme } from "@/lib/theme/theme";
import { saveThemeAction } from "./themeActions";

// Colours, per person: a background and a highlight. Picking one repaints the whole CRM straight
// away as a preview; Save keeps it for this login on every device. Leaving without saving puts the
// saved colours back.

function paint(theme: Theme) {
  for (const [name, value] of Object.entries(themeVars(theme))) document.documentElement.style.setProperty(name, value);
}

function unpaint() {
  for (const name of Object.keys(themeVars(DEFAULT_THEME))) document.documentElement.style.removeProperty(name);
}

// Page colours are all near-black, so side by side they look the same. The chip shows each one's
// tint lifted to a lightness you can tell apart; the page itself uses the real, dark value.
const SWATCH_LIGHTNESS = 0.3;
function tintOf(hex: string): string {
  const { h, s } = toHsl(hex);
  return toHex({ h, s, l: SWATCH_LIGHTNESS });
}

interface SwatchRowProps {
  legend: string;
  /** Show each colour's tint instead of the colour itself (for the near-black page colours). */
  lift?: boolean;
  presets: readonly { name: string; value: string }[];
  value: string;
  onPick: (value: string) => void;
}

function SwatchRow({ legend, presets, value, onPick, lift = false }: SwatchRowProps) {
  const chip = (hex: string) => (lift ? tintOf(hex) : hex);
  const custom = !presets.some((p) => p.value === value);
  return (
    <fieldset>
      <legend className="text-[15px] font-medium text-[var(--color-text)]">{legend}</legend>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {presets.map((p) => {
          const on = p.value === value;
          return (
            <button
              key={p.value}
              type="button"
              aria-pressed={on}
              onClick={() => onPick(p.value)}
              className={`flex h-11 items-center gap-2.5 rounded-full pr-4 pl-1.5 text-[15px] transition-colors ${
                on
                  ? "text-[var(--color-text)] shadow-[inset_0_0_0_1.5px_var(--color-steel)]"
                  : "text-[var(--color-text-muted)] shadow-[inset_0_0_0_1px_var(--color-border-bright)] hover:text-[var(--color-text)]"
              }`}
            >
              <span aria-hidden="true" className="h-8 w-8 rounded-full shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18)]" style={{ background: chip(p.value) }} />
              {p.name}
            </button>
          );
        })}
        <label
          className={`relative flex h-11 cursor-pointer items-center gap-2.5 rounded-full pr-4 pl-1.5 text-[15px] transition-colors ${
            custom
              ? "text-[var(--color-text)] shadow-[inset_0_0_0_1.5px_var(--color-steel)]"
              : "text-[var(--color-text-muted)] shadow-[inset_0_0_0_1px_var(--color-border-bright)] hover:text-[var(--color-text)]"
          }`}
        >
          <span
            aria-hidden="true"
            className="h-8 w-8 rounded-full shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18)]"
            style={{ background: custom ? chip(value) : "conic-gradient(#e3261d, #f0c419, #2bb24c, #8fd3f4, #7a5cf0, #e3261d)" }}
          />
          Your own
          <input type="color" value={value} onChange={(e) => onPick(e.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" aria-label={`${legend}: pick your own colour`} />
        </label>
      </div>
    </fieldset>
  );
}

export default function AppearanceSection({ saved }: { saved: Theme | null }) {
  const router = useRouter();
  const start = saved ?? DEFAULT_THEME;
  const [theme, setThemeState] = useState<Theme>(start);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();
  // What the server last confirmed, so leaving mid-preview can put it back.
  const [kept, setKept] = useState<Theme>(start);
  const dirty = theme.background !== kept.background || theme.accent !== kept.accent;

  useEffect(() => {
    // The layout's <style> already carries the saved colours; inline preview values go on leaving.
    return () => unpaint();
  }, []);

  function pick(patch: Partial<Theme>) {
    // Shown exactly as it will be kept: a pick outside the readable range is pulled back in.
    const next = normalizeTheme({ ...theme, ...patch });
    setThemeState(next);
    setDone(false);
    setError(null);
    paint(next);
  }

  function save(next: Theme) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await saveThemeAction(isDefaultTheme(next) ? null : next);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setKept(next);
        setDone(true);
        router.refresh();
      } catch {
        setError("Couldn't save your colours. Try again.");
      }
    });
  }

  function reset() {
    setThemeState(DEFAULT_THEME);
    paint(DEFAULT_THEME);
    save(DEFAULT_THEME);
  }

  return (
    <section aria-labelledby="appearance-heading" className="card p-5 sm:p-7">
      <h2 id="appearance-heading" className="text-[19px] font-semibold text-[var(--color-text)]">
        Colours
      </h2>
      <div className="mt-6 space-y-8">
        <SwatchRow legend="Background" lift presets={BACKGROUND_PRESETS} value={theme.background} onPick={(background) => pick({ background })} />
        <SwatchRow legend="Highlight" presets={ACCENT_PRESETS} value={theme.accent} onPick={(accent) => pick({ accent })} />
      </div>
      <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-[var(--color-border)] pt-5">
        <button type="button" onClick={() => save(theme)} disabled={pending || !dirty} className="btn btn-primary">
          {pending ? "Saving" : "Save"}
        </button>
        <button type="button" onClick={reset} disabled={pending || (isDefaultTheme(theme) && !dirty)} className="btn btn-secondary">
          Reset
        </button>
        <span role="status" className="text-[15px] text-[var(--color-text-muted)]">
          {done && !dirty ? "Saved" : dirty ? "Previewing" : ""}
        </span>
        {error && (
          <p role="alert" className="w-full text-[15px] text-[var(--color-hot)]">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
