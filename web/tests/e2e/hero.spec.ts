import { test, expect, type Page } from "@playwright/test";
import { site } from "../../src/content/site";

/*
  Hero and background engine. No gate: the page is readable and scrollable from the first paint,
  and the engine fades in behind it, dimmed. Headless WebGL via SwiftShader on the dev server (3100).
*/

type Info = { p: number; heroStart: number; heroEnd: number; store: { phase: string } };

async function info(page: Page): Promise<Info> {
  return page.evaluate(() => (window.__lc ? window.__lc.info() : { store: { phase: "loading" } }) as unknown as Info);
}

async function waitRunning(page: Page) {
  await expect.poll(async () => (await info(page)).store.phase, { timeout: 30_000 }).toMatch(/idle|scrolling|launched/);
}

/* The opacity the page sets as the fade's target. Under SwiftShader the 1.2s CSS fade itself can take
   far longer than real time, so the computed mid-fade value is not a stable signal. */
const canvasOpacity = (page: Page) =>
  page.locator("#hero > div[aria-hidden]").first().evaluate((el) => Number((el as HTMLElement).style.opacity));

test.describe("hero", () => {
  test("the hero is readable at once, with no gate and a call to action", async ({ page }) => {
    await page.goto("/?engine=placeholder");
    await expect(page.getByRole("heading", { level: 1, name: site.hero.title })).toBeVisible();
    await expect(page.locator('[data-testid="gate"], [data-testid="start-button"]')).toHaveCount(0);
    const cta = page.getByRole("link", { name: site.hero.primaryCta.label }).first();
    await expect(cta).toHaveAttribute("href", site.hero.primaryCta.href);
    await expect(page.locator("html")).not.toHaveCSS("overflow", "hidden");
  });

  test("the page scrolls before and after the engine arrives", async ({ page }) => {
    await page.goto("/?debug&engine=placeholder");
    await page.evaluate(() => window.scrollTo(0, 600));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(300);
    await waitRunning(page);
    await page.mouse.wheel(0, 900);
    await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 5_000 }).toBeGreaterThan(700);
  });

  test("the engine fades in behind the page, dimmed, never full strength", async ({ page }) => {
    await page.goto("/?debug&engine=placeholder");
    await waitRunning(page);
    await expect(page.locator("canvas")).toHaveCount(1);
    await expect.poll(() => canvasOpacity(page), { timeout: 5_000 }).toBeGreaterThan(0.3);
    expect(await canvasOpacity(page)).toBeLessThan(1);
  });

  test("a #hash deep link lands on the section with the engine behind it", async ({ page }) => {
    await page.goto(`/?debug&engine=placeholder#${site.book.id}`);
    await waitRunning(page);
    await expect(page.locator("canvas")).toHaveCount(1);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(500);
  });

  test("reduced motion keeps the same hero and draws no canvas", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: site.hero.title })).toBeVisible();
    await page.waitForTimeout(500);
    await expect(page.locator("canvas")).toHaveCount(0);
  });

  test("debug hook pins progress to the matching pixel of the page", async ({ page }) => {
    await page.goto("/?debug&engine=placeholder");
    await waitRunning(page);
    await page.evaluate(() => window.__lc!.setProgress(0.5));
    const i = await info(page);
    expect(i.p).toBeCloseTo(0.5, 2);
    const y = await page.evaluate(() => window.scrollY);
    expect(y).toBeCloseTo((i.heroEnd - i.heroStart) * 0.5 + i.heroStart, -1);
  });
});
