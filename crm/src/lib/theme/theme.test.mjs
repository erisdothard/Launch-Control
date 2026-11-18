// Run: node --experimental-strip-types --test src/lib/theme/theme.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { ACCENT_PRESETS, BACKGROUND_PRESETS, DEFAULT_THEME, contrast, normalizeTheme, parseTheme, themeCss, themeVars, toHex, toHsl } from "./theme.ts";

// The CRM's ink colours (src/styles/tokens.css). They don't change with the theme.
const TEXT = "#f1f3f5";
const TEXT_MUTED = "#c3c9cf";
const TEXT_DIM = "#9aa2ab";
const AA = 4.5;

const everySurface = (vars) => ["--color-bg-sidebar", "--color-bg-primary", "--color-bg-card", "--color-bg-secondary"].map((k) => vars[k]);

test("the default theme reproduces the designed page and highlight", () => {
  const vars = themeVars(DEFAULT_THEME);
  assert.equal(vars["--color-bg-primary"], "#0a0c0e");
  assert.equal(vars["--color-accent"], "#f0c419");
  assert.equal(vars["--color-on-accent"], "#0a0b0c");
});

test("every preset keeps all three ink colours at AA on all four surfaces", () => {
  for (const bg of BACKGROUND_PRESETS) {
    for (const surface of everySurface(themeVars({ background: bg.value, accent: DEFAULT_THEME.accent }))) {
      for (const ink of [TEXT, TEXT_MUTED, TEXT_DIM]) {
        assert.ok(contrast(ink, surface) >= AA, `${bg.name} ${surface} vs ${ink}: ${contrast(ink, surface).toFixed(2)}`);
      }
    }
  }
});

test("the lightest, most saturated page anyone can pick still passes AA", () => {
  for (const wild of ["#ffffff", "#00ff00", "#ff00ff", "#ffff00", "#00ffff", "#3355ff", "#808080"]) {
    for (const surface of everySurface(themeVars({ background: wild, accent: "#f0c419" }))) {
      assert.ok(contrast(TEXT_DIM, surface) >= AA, `${wild} -> ${surface}: ${contrast(TEXT_DIM, surface).toFixed(2)}`);
    }
  }
});

test("button text on any highlight is readable, and the highlight reads on the page", () => {
  const picks = [...ACCENT_PRESETS.map((a) => a.value), "#000000", "#ffffff", "#0000ff", "#ff0000", "#123456"];
  for (const accent of picks) {
    for (const bg of BACKGROUND_PRESETS) {
      const vars = themeVars({ background: bg.value, accent });
      assert.ok(contrast(vars["--color-on-accent"], vars["--color-accent"]) >= AA, `on-accent for ${accent}`);
      assert.ok(contrast(vars["--color-accent"], vars["--color-bg-card"]) >= 3, `${accent} on ${bg.name} card`);
    }
  }
});

test("malformed themes are rejected, never passed into CSS", () => {
  for (const bad of [null, "x", {}, { background: "#fff", accent: "#f0c419" }, { background: "red", accent: "#f0c419" }, { background: "#0a0c0e;}body{display:none", accent: "#f0c419" }, { background: "#0a0c0e" }]) {
    assert.equal(parseTheme(bad), null);
  }
  assert.deepEqual(parseTheme({ background: "#0A0C0E", accent: "#F0C419" }), DEFAULT_THEME);
  assert.match(themeCss(DEFAULT_THEME), /^:root:root\{(--color-[a-z-]+:(#[0-9a-f]{6}|rgba\(\d+, \d+, \d+, 0\.35\));?)+\}$/);
});

test("hex and hsl convert both ways", () => {
  for (const hex of ["#0a0c0e", "#f0c419", "#07140e", "#c6ccd3", "#000000", "#ffffff"]) assert.equal(toHex(toHsl(hex)), hex);
  assert.deepEqual(normalizeTheme(DEFAULT_THEME), DEFAULT_THEME);
});
