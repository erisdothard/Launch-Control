// The campaign sending window. Run: fnm exec --using=22 node --experimental-strip-types --test src/lib/email/sendWindow.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { sendWindowProgress } from "./sendWindow.ts";

const TZ = "America/Chicago";
const at = (iso) => sendWindowProgress(new Date(iso), TZ);

test("the window opens at 8 and closes at 5 on a weekday, team time", () => {
  assert.equal(at("2026-11-11T14:00:00Z"), 0); // Wed 8:00 CST
  assert.ok(Math.abs(at("2026-11-11T20:00:00Z") - 6 / 9) < 1e-9); // Wed 14:00 CST
  assert.equal(at("2026-11-11T13:59:00Z"), null); // 7:59
  assert.equal(at("2026-11-11T23:00:00Z"), null); // 17:00
});

test("weekends never send", () => {
  assert.equal(at("2026-11-14T18:00:00Z"), null); // Sat noon
  assert.equal(at("2026-11-15T18:00:00Z"), null); // Sun noon
});

test("daylight saving is handled by the time zone, not a fixed offset", () => {
  assert.equal(at("2026-07-15T13:00:00Z"), 0); // Wed 8:00 CDT
});
