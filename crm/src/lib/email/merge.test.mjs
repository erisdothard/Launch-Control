// Unit tests for the mail merge (pure functions, no app imports).
// Run: fnm exec --using=22 node --experimental-strip-types --test src/lib/email/merge.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  completeValues,
  missingFields,
  parseRecipientList,
  parseTokens,
  renderMerge,
  sendDuration,
  splitName,
  teamLocalToUtc,
  usedFields,
  utcToTeamLocal,
} from "./merge.ts";

test("fields fill in, fall back, and tidy the gap when empty", () => {
  const v = { first_name: "Dana", company: "Ridge Motorsport" };
  assert.equal(renderMerge("Hi {{first_name}}, about {{ company }}.", v), "Hi Dana, about Ridge Motorsport.");
  assert.equal(renderMerge("Hi {{first_name|there}},", {}), "Hi there,");
  assert.equal(renderMerge("Hi {{first_name}},", {}), "Hi,");
  assert.equal(renderMerge("{{First Name}}", v), "Dana");
  assert.equal(renderMerge("{{unknown|friend}}", v), "friend");
  // Plain text: nothing is escaped here (the HTML path escapes).
  assert.equal(renderMerge("{{company}}", { company: "A & B <Co>" }), "A & B <Co>");
});

test("tokens, used and missing fields", () => {
  assert.deepEqual(parseTokens("{{first_name|there}} {{city}}"), [
    { field: "first_name", fallback: "there" },
    { field: "city", fallback: null },
  ]);
  assert.deepEqual(usedFields(["{{a}}", "{{b}} {{a}}"]), ["a", "b"]);
  assert.deepEqual(missingFields(["Hi {{first_name|there}} from {{city}}"], { first_name: "" }), ["city"]);
});

test("names split and complete", () => {
  assert.deepEqual(splitName("Dr. Dana M. Reyes Jr."), { first: "Dana", last: "Reyes" });
  assert.deepEqual(splitName("Cher"), { first: "Cher", last: "" });
  const v = completeValues({ full_name: "Kevin Osei", email: "KEVIN@Apex.com" });
  assert.equal(v.first_name, "Kevin");
  assert.equal(v.last_name, "Osei");
  assert.equal(v.email, "kevin@apex.com");
  assert.equal(completeValues({ first_name: "Sofia", last_name: "Laurent" }).full_name, "Sofia Laurent");
});

test("CSV with a header maps known and unknown columns", () => {
  const list = parseRecipientList('Name,Email,Company,Industry\n"Reyes, Dana",dana@ridge.com,Ridge Motorsport,Racing\nNo Address,,Nobody Inc,\n');
  assert.equal(list.contacts.length, 1);
  assert.equal(list.contacts[0].email, "dana@ridge.com");
  assert.equal(list.contacts[0].values.company, "Ridge Motorsport");
  assert.equal(list.contacts[0].values.industry, "Racing");
  assert.equal(list.rejected.length, 1);
  assert.ok(list.columns.includes("industry"));
});

test("CSV without a header finds the address column", () => {
  const list = parseRecipientList("Dana Reyes\tdana@ridge.com\tRidge\nKevin Osei\tkevin@apex.com\tApex");
  assert.equal(list.contacts.length, 2);
  assert.equal(list.contacts[1].values.first_name, "Kevin");
  assert.equal(list.contacts[1].values.company, "Apex");
});

test("loose lists: separators and Outlook-style names", () => {
  const list = parseRecipientList("Dana Reyes <dana@ridge.com>; kevin@apex.com, sofia@coast.com\nnot an address");
  assert.deepEqual(list.contacts.map((c) => c.email), ["dana@ridge.com", "kevin@apex.com", "sofia@coast.com"]);
  assert.equal(list.contacts[0].values.first_name, "Dana");
  assert.deepEqual(list.rejected, ["not an address"]);
});

test("team timezone round trip, across daylight saving", () => {
  assert.equal(teamLocalToUtc("2026-10-22", "09:30"), "2026-10-22T14:30:00.000Z"); // CDT, UTC-5
  assert.equal(teamLocalToUtc("2026-12-01", "09:30"), "2026-12-01T15:30:00.000Z"); // CST, UTC-6
  assert.deepEqual(utcToTeamLocal("2026-12-01T15:30:00.000Z"), { date: "2026-12-01", time: "09:30" });
  assert.equal(teamLocalToUtc("bad", "09:30"), null);
});

test("send duration in words", () => {
  assert.equal(sendDuration(42, 10), "about 5 minutes");
  assert.equal(sendDuration(5, 10), "about a minute");
  assert.equal(sendDuration(900, 10), "about 1.5 hours");
});

test("a stray line doesn't turn a CSV into a loose list", () => {
  const list = parseRecipientList("name,email,company\nNina Brooks,nina@brooks.com,Brooks Bakery\nDana Reyes,dana@ridge.com,Ridge\nbad line");
  assert.equal(list.contacts.length, 2);
  assert.equal(list.contacts[0].values.first_name, "Nina");
  assert.equal(list.contacts[0].values.company, "Brooks Bakery");
  assert.deepEqual(list.rejected, ["bad line"]);
});
