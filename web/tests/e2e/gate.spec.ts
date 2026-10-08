import { test, expect, type Page } from "@playwright/test";

/*
  Gate and scroll behaviour (PLAN.md test strategy).
  Runs against the dev server on the port in playwright.config.ts (3100). Headless WebGL via SwiftShader.
*/

const GATE = '[data-testid="gate"]';
const START = '[data-testid="start-button"]';

type Info = { p: number; rpm: number; heroStart: number; heroEnd: number; store: { phase: string } };

async function info(page: Page): Promise<Info> {
  return page.evaluate(() => (window.__lc ? window.__lc.info() : { store: { phase: "loading" } }) as unknown as Info);
}

async function phase(page: Page) {
  return (await info(page)).store.phase;
}

async function waitReady(page: Page) {
  await page.waitForSelector(START);
  await expect.poll(() => phase(page), { timeout: 30_000 }).toBe("ready");
}

test.describe("gate", () => {
  test("scroll is locked before the press, press starts ignition, scroll starts at 0 with no camera jump", async ({
    page,
  }) => {
    await page.goto("/?debug&engine=placeholder");
    await waitReady(page);

    // Locked: wheel does nothing while the gate is up.
    await expect(page.locator(GATE)).toBeVisible();
    await expect(page.locator("html")).toHaveCSS("overflow", "hidden");
    await page.mouse.wheel(0, 1200);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    expect((await info(page)).p).toBeLessThan(0.001);

    // Press.
    await page.locator(START).click();
    await expect.poll(() => phase(page)).toBe("igniting");
    // Ignition is time-based (1.8s) and ends in idle at p = 0, rpm = 800.
    await expect.poll(() => phase(page), { timeout: 5_000 }).toBe("idle");
    const after = await info(page);
    expect(after.p).toBeLessThan(0.001);
    expect(Math.round(after.rpm)).toBe(800);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await expect(page.locator("html")).not.toHaveCSS("overflow", "hidden");
    await expect(page.locator(GATE)).toHaveCount(0);

    // Scrolling now moves p.
    await page.mouse.wheel(0, 1500);
    await expect.poll(async () => (await info(page)).p, { timeout: 5_000 }).toBeGreaterThan(0.05);
    expect(await phase(page)).toBe("scrolling");
  });

  test("keyboard path: Tab reaches the start button, Enter ignites", async ({ page }) => {
    await page.goto("/?debug&engine=placeholder");
    await waitReady(page);
    await page.keyboard.press("Tab"); // skip link
    await expect(page.locator('[data-testid="skip-link"]')).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.locator(START)).toBeFocused();
    await page.keyboard.press("Enter");
    await expect.poll(() => phase(page)).toBe("igniting");
    await expect.poll(() => phase(page), { timeout: 5_000 }).toBe("idle");
    // Focus lands on the caption region.
    await expect(page.locator("#hero-captions")).toBeFocused();
  });

  test("skip link bypasses the gate, keeps the engine, and lands on the first panel", async ({ page }) => {
    await page.goto("/?debug&engine=placeholder");
    await waitReady(page);
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    await expect(page.locator(GATE)).toHaveCount(0);
    // The jump lands past the stage, so the running phase is launched (idle/scrolling on a short page).
    await expect.poll(() => phase(page), { timeout: 5_000 }).toMatch(/idle|scrolling|launched/);
    await expect(page.locator("canvas")).toHaveCount(1);
    await expect.poll(() => page.evaluate(() => window.location.hash)).toBe("#build");
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
  });

  test("#hash deep link bypasses the gate and keeps the engine", async ({ page }) => {
    await page.goto("/?debug&engine=placeholder#build");
    // The gate only opens once the engine is compiled, which takes seconds under SwiftShader:
    // wait for the running phase first, then assert the gate is gone.
    await expect.poll(() => phase(page), { timeout: 30_000 }).toMatch(/idle|scrolling|launched/);
    await expect(page.locator(GATE)).toHaveCount(0);
    await expect(page.locator("canvas")).toHaveCount(1);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
  });

  test("reduced motion renders the poster hero with every caption and no canvas", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await expect(page.locator(GATE)).toHaveCount(0);
    await expect(page.locator("canvas")).toHaveCount(0);
    const hero = page.locator("#hero");
    await expect(hero).toBeVisible();
    await expect(hero.locator("li")).toHaveCount(6);
    // Content is reachable by plain scrolling.
    await page.evaluate(() => window.scrollTo(0, 2000));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(1000);
  });

  test("debug hook pins progress to the matching pixel of the stage", async ({ page }) => {
    await page.goto("/?debug&engine=placeholder");
    await waitReady(page);
    await page.evaluate(() => window.__lc!.setProgress(0.5));
    const i = await info(page);
    expect(i.p).toBeCloseTo(0.5, 2);
    expect(i.store.phase).toBe("scrolling");
    const y = await page.evaluate(() => window.scrollY);
    expect(y).toBeCloseTo((i.heroEnd - i.heroStart) * 0.5 + i.heroStart, -1);
  });
});
