// Can this address receive mail: the pure parts (syntax, provider typos, DNS answers to a verdict).
// Run: fnm exec --using=22 node --experimental-strip-types --test src/lib/email/addressCheck.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addressProblem,
  domainOf,
  editDistance,
  lookupFromError,
  mxIsConclusive,
  REASONS,
  syntaxProblem,
  typoOf,
  verdictFromDns,
} from "./addressCheck.ts";

const records = (...values) => ({ kind: "records", values });
const NX = { kind: "nxdomain" };
const NODATA = { kind: "nodata" };
const ERR = { kind: "error" };

test("syntax: real shapes pass", () => {
  for (const ok of ["dana@ridgemotorsport.com", "first.last+tag@sub.example.co.uk", "o'neil@shop.com", "a@b.io", "x@xn--bcher-kva.de"]) {
    assert.equal(syntaxProblem(ok), null, ok);
  }
});

test("syntax: things the quick regex lets through are caught", () => {
  for (const bad of ["a..b@x.com", ".a@x.com", "a.@x.com", "a@-x.com", "a@x-.com", "a@x..com", "a@x.c0m", "@x.com", "a@", "a@localhost", `${"a".repeat(65)}@x.com`]) {
    assert.equal(syntaxProblem(bad), REASONS.syntax, bad);
  }
});

test("typos of the big providers", () => {
  const cases = {
    "gmial.com": "gmail.com",
    "gamil.com": "gmail.com",
    "gmai.com": "gmail.com",
    "gmaill.com": "gmail.com",
    "gmail.co": "gmail.com",
    "gmail.con": "gmail.com",
    "gmail.cm": "gmail.com",
    "gmail.com.com": "gmail.com",
    "gmial.con": "gmail.com",
    "hotmial.com": "hotmail.com",
    "hotmal.com": "hotmail.com",
    "yaho.com": "yahoo.com",
    "yahooo.com": "yahoo.com",
    "yahoo.co": "yahoo.com",
    "outlok.com": "outlook.com",
    "outloo.com": "outlook.com",
    "iclod.com": "icloud.com",
    "aol.co": "aol.com",
  };
  for (const [typo, meant] of Object.entries(cases)) assert.equal(typoOf(typo), meant, typo);
});

test("real domains are never called typos", () => {
  for (const real of [
    "gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com", "aol.com",
    "ymail.com", "email.com", "mail.com", "cloud.com", "gmx.com", "live.com", "msn.com", "me.com",
    "yahoo.co.uk", "hotmail.co.uk", "yahoo.ca", "outlook.de", "googlemail.com",
    "aoe.com", "all.com", "ridgemotorsport.com", "golaunchcontrol.com", "gmail.dev",
  ]) {
    assert.equal(typoOf(real), null, real);
  }
});

test("edit distance counts a swap as one slip", () => {
  assert.equal(editDistance("gmial", "gmail", 1), 1);
  assert.equal(editDistance("gmail", "gmail", 1), 0);
  assert.equal(editDistance("gxxxl", "gmail", 1), 2);
});

test("DNS errors: only NXDOMAIN and no-data are answers", () => {
  assert.deepEqual(lookupFromError("ENOTFOUND"), NX);
  assert.deepEqual(lookupFromError("ENODATA"), NODATA);
  for (const code of ["ETIMEOUT", "ESERVFAIL", "ECONNREFUSED", "EREFUSED", "ECANCELLED", undefined]) {
    assert.deepEqual(lookupFromError(code), ERR, String(code));
  }
});

test("verdict: MX with a host accepts mail", () => {
  assert.equal(verdictFromDns(records("mx1.example.com", "mx2.example.com")).status, "ok");
  assert.equal(mxIsConclusive(records("mx1.example.com")), true);
});

test("verdict: a null MX ('.') means no mail", () => {
  const v = verdictFromDns(records(""));
  assert.equal(v.status, "bad");
  assert.equal(v.reason, "The domain doesn't accept email");
  assert.equal(verdictFromDns(records(".")).status, "bad");
});

test("verdict: NXDOMAIN means no mail", () => {
  assert.equal(verdictFromDns(NX).status, "bad");
  assert.equal(mxIsConclusive(NX), true);
});

test("verdict: a timeout or server error is unknown, never bad", () => {
  assert.equal(verdictFromDns(ERR).status, "unknown");
  assert.equal(verdictFromDns(NODATA, ERR, NODATA).status, "unknown");
  assert.equal(verdictFromDns(NODATA, NODATA, ERR).status, "unknown");
});

test("verdict: no MX falls back to A/AAAA (RFC 5321)", () => {
  assert.equal(mxIsConclusive(NODATA), false);
  assert.equal(verdictFromDns(NODATA, records("93.184.216.34"), NODATA).status, "ok");
  assert.equal(verdictFromDns(NODATA, NODATA, records("2606:2800::1")).status, "ok");
  // A fallback error still wins over "bad" when the other side found something.
  assert.equal(verdictFromDns(NODATA, records("1.2.3.4"), ERR).status, "ok");
  assert.equal(verdictFromDns(NODATA, NODATA, NODATA).status, "bad");
  assert.equal(verdictFromDns(NODATA, NX, NX).status, "bad");
  // Asked without the fallback answers: can't tell.
  assert.equal(verdictFromDns(NODATA).status, "unknown");
});

test("addressProblem combines syntax, typo and the domain verdict", () => {
  assert.equal(addressProblem("a..b@acme.com", undefined), REASONS.syntax);
  assert.equal(addressProblem("dana@gmial.com", undefined), "Looks like a typo of gmail.com");
  assert.equal(addressProblem("dana@dead.example", { status: "bad", problem: "no_mail", reason: REASONS.no_mail }), "The domain doesn't accept email");
  assert.equal(addressProblem("dana@slow.example", { status: "unknown" }), null);
  assert.equal(addressProblem("dana@acme.com", { status: "ok" }), null);
  assert.equal(addressProblem("dana@acme.com", undefined), null);
});

test("domainOf lowercases and drops a trailing dot", () => {
  assert.equal(domainOf("Dana@Acme.COM."), "acme.com");
  assert.equal(domainOf("nope"), "");
});
