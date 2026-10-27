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
