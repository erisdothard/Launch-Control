// Unit tests for the pure send-path helpers (attachments, bounces, unsubscribe tokens, headers).
// Run: fnm exec --using=22 node --experimental-strip-types --test src/lib/email/review-fixes.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { validAttachment, MAX_FILE_BYTES } from "./attachments.ts";
import { isAutoReply, isHardBounce, isSenderProblem } from "./deliverability.ts";
import { readUnsubscribeToken, unsubscribeHeaders, unsubscribeToken } from "./unsubscribe.ts";
import { messageIdHeader } from "./text.ts";

const file = (path, extra = {}) => ({ name: "deck.pdf", path, size: 1000, type: "application/pdf", ...extra });

test("both composers' upload folders are valid attachments", () => {
  assert.equal(validAttachment(file("outbound/1a2b/deck.pdf")), true);
  assert.equal(validAttachment(file("campaigns/1a2b/deck.pdf")), true);
});

test("other folders, .. segments, header tricks and oversize files are refused", () => {
  assert.equal(validAttachment(file("private/1a2b/deck.pdf")), false);
  assert.equal(validAttachment(file("campaigns/../outbound/x.pdf")), false);
  assert.equal(validAttachment(file("outbound/a/x.pdf", { name: "x\r\nBcc: a@b.com" })), false);
  assert.equal(validAttachment(file("outbound/a/x.pdf", { type: "text/html\r\nX: y" })), false);
  assert.equal(validAttachment(file("outbound/a/x.pdf", { size: MAX_FILE_BYTES + 1 })), false);
});

test("only recipient-specific codes are hard bounces", () => {
  assert.equal(isHardBounce("550 5.1.1 RESOLVER.ADR.RecipNotFound; not found"), true);
  assert.equal(isHardBounce("550 5.1.10 RESOLVER.ADR.RecipientNotFound"), true);
  assert.equal(isHardBounce("Recipient not found by SMTP address lookup"), true);
  assert.equal(isHardBounce("550 User unknown"), true);
  assert.equal(isHardBounce("550 5.1.1 Mailbox unavailable"), true);
  assert.equal(isHardBounce("550 Mailbox unavailable"), false);
  assert.equal(isHardBounce("550 5.7.708 Service unavailable. Access denied, traffic not accepted from this IP"), false);
  assert.equal(isHardBounce("554 5.7.1 Message rejected as spam"), false);
  assert.equal(isHardBounce("552 Message size exceeds fixed maximum"), false);
  assert.equal(isHardBounce("421 4.7.0 Too many messages, throttled"), false);
});

test("sender-side failures pause the campaign", () => {
  assert.equal(isSenderProblem("550 5.7.708 Access denied"), true);
  assert.equal(isSenderProblem("552 5.3.4 Message size exceeds fixed limit"), true);
  assert.equal(isSenderProblem("432 4.3.2 STOREDRV.ClientSubmit; sender thread limit exceeded, throttled"), true);
  assert.equal(isSenderProblem("550 5.1.1 User unknown"), false);
});

test("out-of-office replies are recognised by subject", () => {
  assert.equal(isAutoReply("Automatic reply: Quick question"), true);
  assert.equal(isAutoReply("Out of Office: back Monday"), true);
  assert.equal(isAutoReply("Re: Quick question"), false);
});

test("unsubscribe tokens round-trip and reject tampering", () => {
  const secret = "s3cret";
  const lead = "0b9f6e1c-1a2b-4c3d-8e9f-0a1b2c3d4e5f";
  const t = unsubscribeToken({ email: "Dana@Ridge.com", leadId: lead }, secret);
  assert.deepEqual(readUnsubscribeToken(t, secret), { email: "dana@ridge.com", leadId: lead });
  assert.equal(readUnsubscribeToken(t, "other"), null);
  const [payload, mac] = t.split(".");
  const forged = Buffer.from("victim@x.com|", "utf8").toString("base64url");
  assert.equal(readUnsubscribeToken(`${forged}.${mac}`, secret), null);
  assert.equal(readUnsubscribeToken(`${payload}`, secret), null);
  assert.equal(readUnsubscribeToken("", secret), null);
  assert.deepEqual(readUnsubscribeToken(unsubscribeToken({ email: "a@b.co", leadId: null }, secret), secret), { email: "a@b.co", leadId: null });
});

test("List-Unsubscribe carries an https one-click link and a mailto", () => {
  const h = unsubscribeHeaders({ email: "a@b.co", leadId: null }, "https://crm.example.com", "max@example.com", "k");
  assert.match(h["List-Unsubscribe"], /^<https:\/\/crm\.example\.com\/api\/unsubscribe\?t=[\w.-]+>, <mailto:max@example\.com\?subject=unsubscribe>$/);
  assert.equal(h["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
});

test("Message-ID headers lose CR/LF and must be <...>", () => {
  assert.equal(messageIdHeader("<abc@x.com>"), "<abc@x.com>");
  assert.equal(messageIdHeader("<abc@x.com>\r\nBcc: evil@x.com"), null);
  assert.equal(messageIdHeader("<abc@x.com\r\n>"), "<abc@x.com>");
  assert.equal(messageIdHeader("abc@x.com"), null);
  assert.equal(messageIdHeader(null), null);
});
