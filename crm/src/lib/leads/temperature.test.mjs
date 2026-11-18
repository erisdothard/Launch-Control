// Run: fnm exec --using=22 node --experimental-strip-types --test src/lib/leads/temperature.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { autoTemperature, parseTemperature, temperatureOf, TEMPERATURE_RANK } from "./temperature.ts";

const lead = (over = {}) => ({ status: "new", awaiting: null, lastReplyAt: null, temperature: null, ...over });

test("a lead nobody has answered is cold", () => {
  assert.equal(autoTemperature(lead()), "cold");
  assert.equal(autoTemperature(lead({ status: "contacted", awaiting: "them" })), "cold");
  assert.equal(autoTemperature(lead({ status: "nurture" })), "cold");
});

test("a lead who has written back is warm, and stays warm while we wait on them", () => {
  assert.equal(autoTemperature(lead({ status: "replied", awaiting: "them", lastReplyAt: "2026-11-10T15:00:00Z" })), "warm");
  assert.equal(autoTemperature(lead({ status: "contacted", awaiting: "them", lastReplyAt: "2026-11-10T15:00:00Z" })), "warm");
});

test("our move, or a meeting, proposal or negotiation, is hot", () => {
  assert.equal(autoTemperature(lead({ status: "replied", awaiting: "us" })), "hot");
  for (const status of ["meeting", "proposal", "negotiation"]) assert.equal(autoTemperature(lead({ status })), "hot");
});

test("a hand-set temperature always wins over the automatic one", () => {
  assert.equal(temperatureOf(lead({ status: "replied", awaiting: "us", temperature: "cold" })), "cold");
  assert.equal(temperatureOf(lead({ temperature: "hot" })), "hot");
  assert.equal(temperatureOf(lead({ status: "meeting" })), "hot");
});

test("only the three values parse, and hot sorts first", () => {
  assert.equal(parseTemperature("warm"), "warm");
  for (const bad of ["", "HOT", "lukewarm", null, undefined, 3]) assert.equal(parseTemperature(bad), null);
  assert.ok(TEMPERATURE_RANK.hot < TEMPERATURE_RANK.warm && TEMPERATURE_RANK.warm < TEMPERATURE_RANK.cold);
});
