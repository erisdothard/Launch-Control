// Unit tests for who a mass email goes to (pure functions).
// Run: fnm exec --using=22 node --experimental-strip-types --test src/components/compose/audience.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

// audience.ts imports "@/lib/..." (the tsconfig alias); map it to src/ for plain node.
const SRC = new URL("../../", import.meta.url).href;
register(
  "data:text/javascript," +
    encodeURIComponent(
      `export async function resolve(s, c, next) {
        if (s.startsWith("@/")) return next(${JSON.stringify(SRC)} + s.slice(2) + ".ts", c);
        return next(s, c);
      }`
    )
);
const { buildContext, evaluateAudience, leadCandidate, EXCLUDE_LABELS } = await import("./audience.ts");

const lead = (id, extra = {}) => ({
  id, businessName: `Shop ${id}`, email: `${id}@shop.com`, contactName: "", title: "", city: "", state: "",
  website: "", phone: "615-555-0100", status: "new", source: "lead-gen", doNotContact: false, callList: false,
  lastContactedAt: null, views: [], ...extra,
});

test("call-list leads are excluded with their own reason", () => {
  const leads = [lead("a"), lead("b", { callList: true })];
  const { included, excluded } = evaluateAudience(leads.map((l) => leadCandidate(l, "View")), buildContext(leads, [], 0, []));
  assert.deepEqual(included.map((r) => r.leadId), ["a"]);
  assert.equal(excluded.length, 1);
  assert.equal(excluded[0].excluded, "call_list");
  assert.equal(EXCLUDE_LABELS.call_list.title, "Call list: phone only");
  assert.equal(EXCLUDE_LABELS.call_list.overridable, false);
});

test("a pasted address that matches a call-list lead is excluded too", () => {
  const leads = [lead("b", { callList: true })];
  const pasted = { email: "B@shop.com", leadId: null, values: {}, origin: "Pasted list" };
  const { included, excluded } = evaluateAudience([pasted], buildContext(leads, [], 0, []));
  assert.equal(included.length, 0);
  assert.equal(excluded[0].excluded, "call_list");
});

test("do not contact still wins over call list", () => {
  const leads = [lead("c", { callList: true, doNotContact: true })];
  const { excluded } = evaluateAudience(leads.map((l) => leadCandidate(l, "View")), buildContext(leads, [], 0, []));
  assert.equal(excluded[0].excluded, "do_not_contact");
});

test("an address that can't receive email is set aside with the plain reason", () => {
  const leads = [lead("a"), lead("d", { email: "d@gmial.com" })];
  const bad = new Map([["d@gmial.com", "Looks like a typo of gmail.com"]]);
  const { included, excluded } = evaluateAudience(leads.map((l) => leadCandidate(l, "View")), buildContext(leads, [], 0, [], Date.now(), bad));
  assert.deepEqual(included.map((r) => r.leadId), ["a"]);
  assert.equal(excluded[0].excluded, "undeliverable");
  assert.equal(excluded[0].detail, "Looks like a typo of gmail.com");
  assert.equal(EXCLUDE_LABELS.undeliverable.overridable, false);
});

test("the recent-contact override can't put an undeliverable address back", () => {
  const now = Date.now();
  const leads = [lead("e", { lastContactedAt: new Date(now - 86_400_000).toISOString() })];
  const bad = new Map([["e@shop.com", "The domain doesn't accept email"]]);
  const { included, excluded } = evaluateAudience(leads.map((l) => leadCandidate(l, "View")), buildContext(leads, [], 30, ["e@shop.com"], now, bad));
  assert.equal(included.length, 0);
  assert.equal(excluded[0].excluded, "undeliverable");
});

test("without a check result nobody is set aside as undeliverable", () => {
  const leads = [lead("f")];
  const { included } = evaluateAudience(leads.map((l) => leadCandidate(l, "View")), buildContext(leads, [], 0, []));
  assert.equal(included.length, 1);
});
