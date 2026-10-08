import { test, expect, type Page } from "@playwright/test";
import { site } from "../../src/content/site";

/*
  Content panels over the engine. Opens the real page with the placeholder engine.
*/
const SECTION_IDS = [site.build.id, site.crm.id, site.book.id] as const;

async function openSections(page: Page): Promise<void> {
  await page.goto("/?debug&engine=placeholder");
  await expect(page.locator(`#${site.build.id}`)).toBeAttached();
}

test.describe("content sections", () => {
  test("every section renders with its id and an accessible name", async ({ page }) => {
    await openSections(page);
    for (const id of SECTION_IDS) {
      const section = page.locator(`section#${id}`);
      await expect(section).toHaveCount(1);
      await expect(section).toHaveAttribute("aria-labelledby", `${id}-title`);
      await expect(page.locator(`#${id}-title`)).toHaveCount(1);
    }
    await expect(page.locator("footer")).toHaveCount(1);
  });

  test("footer carries the CC BY credit as a link", async ({ page }) => {
    await openSections(page);
    const credit = page.locator(`footer a[href="${site.footer.credit.href}"]`);
    await expect(credit).toHaveCount(1);
    await expect(credit).toContainText(site.footer.credit.license);
  });

  test("the engine canvas stays mounted behind the content, dimmed", async ({ page }) => {
    await openSections(page);
    await expect.poll(() => page.evaluate(() => Boolean(window.__lc)), { timeout: 30_000 }).toBe(true);
    // Jump only once the engine is running, so the first-frame setup cannot overwrite the jump.
    await expect
      .poll(() => page.evaluate(() => (window.__lc!.info() as { store: { phase: string } }).store.phase), {
        timeout: 30_000,
      })
      .toMatch(/idle|scrolling|launched/);
    // Jump the stage to its end through the debug hook (snaps the smoothed progress), then check
    // the fixed canvas wrapper, #hero's first aria-hidden child (R3F adds its own inner div).
    await page.evaluate(() => window.__lc!.setProgress(1));
    await expect(page.locator("canvas")).toHaveCount(1);
    const opacity = () =>
      page
        .locator("#hero > div[aria-hidden]")
        .first()
        .evaluate((el) => Number(getComputedStyle(el).opacity));
    // The canvas fades in over 1.2s: wait for it to arrive, then check it stays dimmed.
    await expect.poll(opacity, { timeout: 10_000 }).toBeGreaterThan(0.2);
    expect(await opacity()).toBeLessThan(1);
  });

  test("empty submit shows inline errors and does not send", async ({ page }) => {
    await openSections(page);
    const form = page.locator(`#${site.book.id} form`);
    await form.scrollIntoViewIfNeeded();
    await form.getByRole("button", { name: site.book.submit }).click();

    const name = page.locator("#book-name");
    await expect(name).toHaveAttribute("aria-invalid", "true");
    await expect(name).toHaveAttribute("aria-describedby", "book-name-error");
    await expect(page.locator("#book-name-error")).toHaveText(site.book.errors.required);
    await expect(page.locator("#book-email-error")).toHaveText(site.book.errors.required);
    await expect(page.locator("#book-launching-error")).toHaveText(site.book.errors.required);
    await expect(page.locator("#book-budget-error")).toHaveText(site.book.errors.required);
    await expect(form).toBeVisible();
  });

  test("a bad email shows the email error on blur", async ({ page }) => {
    await openSections(page);
    const email = page.locator("#book-email");
    await email.scrollIntoViewIfNeeded();
    await email.fill("not-an-email");
    await email.blur();
    await expect(page.locator("#book-email-error")).toHaveText(site.book.errors.email);
  });

  test("a valid submit replaces the form with the success copy", async ({ page }) => {
    await openSections(page);
    const section = page.locator(`#${site.book.id}`);
    await section.scrollIntoViewIfNeeded();
    await page.locator("#book-name").fill("Test Driver");
    await page.locator("#book-email").fill("driver@example.com");
    await page.locator("#book-launching").fill("A freight marketplace.");
    await page.locator("#book-budget").selectOption(site.book.fields.budgetOptions[1]);
    await section.getByRole("button", { name: site.book.submit }).click();

    await expect(section.getByRole("status")).toContainText(site.book.success);
    await expect(section.locator("form")).toHaveCount(0);
  });
});
