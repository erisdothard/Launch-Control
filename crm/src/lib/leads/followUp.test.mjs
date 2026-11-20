// Run: fnm exec --using=22 node --experimental-strip-types --test src/lib/leads/followUp.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { reminderDate } from "./followUp.ts";

test("a reminder is counted from the team's day the email went out", () => {
  // 02:30 UTC on the 18th is still the evening of the 17th in Chicago.
  assert.equal(reminderDate("2026-11-18T02:30:00+00:00", 7), "2026-11-24");
  assert.equal(reminderDate("2026-11-18T15:00:00+00:00", 7), "2026-11-25");
  assert.equal(reminderDate("2026-11-18T15:00:00+00:00", 3), "2026-11-21");
});

test("a reminder crosses the end of a month and a year", () => {
  assert.equal(reminderDate("2026-11-27T18:00:00Z", 7), "2026-12-04");
  assert.equal(reminderDate("2026-12-28T18:00:00Z", 14), "2027-01-11");
});
