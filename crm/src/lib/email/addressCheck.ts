// Can this address receive mail at all? The pure half of the check: syntax, typos of the big
// providers, and turning DNS answers into a verdict. No "@/" imports and no node APIs, so it runs in
// the browser (the composer), on the server (verifyAddress.ts) and under plain `node --test`.
//
// What this catches: addresses that can't be delivered as written, dead domains, and misspelled
// provider domains (gmial.com). What it can't catch: a misspelled mailbox at a real domain
// (jhon@acme.com). Only the receiving server knows that, and it says so with a bounce; the worker
// suppresses hard bounces so the same address is never tried twice.

export type AddressProblem = "syntax" | "typo" | "no_mail";

export interface DomainVerdict {
  /** "ok" also covers "couldn't tell": a timeout or DNS server error never marks a domain bad. */
  status: "ok" | "bad" | "unknown";
  problem?: AddressProblem;
  /** Plain words, shown in the composer and stored as the skip reason. */
  reason?: string;
  /** For a typo: the domain they probably meant. */
  suggestion?: string;
}

export const REASONS = {
  syntax: "The address isn't written correctly",
  no_mail: "The domain doesn't accept email",
  typo: (suggestion: string) => `Looks like a typo of ${suggestion}`,
} as const;

const OK: DomainVerdict = { status: "ok" };
const UNKNOWN: DomainVerdict = { status: "unknown" };

export function domainOf(email: string): string {
  const at = email.lastIndexOf("@");
  return at < 0 ? "" : email.slice(at + 1).trim().toLowerCase().replace(/\.$/, "");
}

const LOCAL = /^[a-z0-9!#$%&'*+/=?^_`{|}~.-]+$/i;
const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;
const TLD = /^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/i;

/**
 * RFC 5321 limits and the shapes real mailboxes use. Stricter than the composer's quick regex
 * (which lets "a..b@x.com" and "a@-x.com" through) but never rejects a deliverable address.
 */
export function syntaxProblem(email: string): string | null {
  const value = email.trim();
  const at = value.lastIndexOf("@");
  if (at <= 0 || at === value.length - 1 || value.length > 254) return REASONS.syntax;
  const local = value.slice(0, at);
  const domain = value.slice(at + 1).replace(/\.$/, "");
  if (local.length > 64 || !LOCAL.test(local) || local.startsWith(".") || local.endsWith(".") || local.includes("..")) return REASONS.syntax;
  if (domain.length > 253) return REASONS.syntax;
  const labels = domain.split(".");
  if (labels.length < 2 || !labels.every((l) => LABEL.test(l)) || !TLD.test(labels[labels.length - 1])) return REASONS.syntax;
  return null;
}

/** The free providers most of Max's leads use. Typos are only judged against these. */
const PROVIDERS = ["gmail", "yahoo", "hotmail", "outlook", "icloud", "aol"] as const;

/** Real domains a typo rule would otherwise flag. Never call these a typo. */
const REAL = new Set(["email.com", "mail.com", "ymail.com", "gmx.com", "cloud.com", "live.com", "msn.com", "me.com", "mac.com", "hotmail.co.uk", "yahoo.co.uk"]);

/** Endings people mistype ".com" as. */
const COM_TYPOS = new Set(["co", "cm", "con", "cmo", "om", "comm", "coom", "vom", "xom", "cpm", "ocm", "c0m", "com.com"]);

/** Damerau-Levenshtein distance, capped: returns max + 1 as soon as it's exceeded. */
export function editDistance(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, d[i - 2][j - 2] + 1);
      d[i][j] = v;
      rowMin = Math.min(rowMin, v);
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length][b.length];
}

/**
 * The provider domain this one is probably a typo of, or null. Deliberately narrow, because a
 * false "typo" drops a real person: only the six big free providers, at most one slip in the name
 * (gmial, gmai, gmaill, yahooo) with the same first letter (so ymail.com and email.com stay real),
 * and/or a mistyped ".com" (gmail.co, yahoo.cm, gmial.con).
 */
export function typoOf(domain: string): string | null {
  const d = domain.trim().toLowerCase().replace(/\.$/, "");
  if (!d || REAL.has(d)) return null;
  const dot = d.indexOf(".");
  if (dot <= 0) return null;
  const name = d.slice(0, dot);
  const tld = d.slice(dot + 1);
  if (tld !== "com" && !COM_TYPOS.has(tld)) return null;
  for (const p of PROVIDERS) {
    const right = `${p}.com`;
    if (d === right) return null;
    if (name === p) return right;
    // Short names (aol) sit one edit from too many real words; only the ".com" slip counts for them.
    if (p.length >= 5 && name[0] === p[0] && editDistance(name, p, 1) === 1) return right;
  }
  return null;
}

/** The verdict that needs no network: a provider typo is bad whatever DNS says (typo domains often have MX). */
export function staticVerdict(domain: string): DomainVerdict | null {
  const suggestion = typoOf(domain);
  return suggestion ? { status: "bad", problem: "typo", reason: REASONS.typo(suggestion), suggestion } : null;
}

/** One DNS question's outcome, as the resolver reported it. */
export type Lookup =
  | { kind: "records"; values: string[] }
  /** NXDOMAIN: the domain doesn't exist. */
  | { kind: "nxdomain" }
  /** The domain exists but has no records of this type. */
  | { kind: "nodata" }
  /** Timeout, SERVFAIL, refused, no network: says nothing about the domain. */
  | { kind: "error" };

/** Maps a node:dns error code to a Lookup. Only "doesn't exist" and "no records" are answers. */
export function lookupFromError(code: string | undefined): Lookup {
  if (code === "ENOTFOUND" || code === "NXDOMAIN") return { kind: "nxdomain" };
  if (code === "ENODATA") return { kind: "nodata" };
  return { kind: "error" };
}

const isNullMx = (exchange: string) => exchange === "" || exchange === ".";

/**
 * RFC 5321 section 5.1 and RFC 7505, from the answers:
 * - MX records with a real host: accepts mail.
 * - Only a null MX ("."): the domain says it takes no mail.
 * - No MX at all: fall back to A/AAAA (the "implicit MX"); no address either means no mail.
 * - NXDOMAIN: no mail.
 * - Any error on the way: unknown, never bad. A slow DNS server must not drop real people.
 */
export function verdictFromDns(mx: Lookup, a?: Lookup, aaaa?: Lookup): DomainVerdict {
  const noMail: DomainVerdict = { status: "bad", problem: "no_mail", reason: REASONS.no_mail };
  if (mx.kind === "error") return UNKNOWN;
  if (mx.kind === "nxdomain") return noMail;
  if (mx.kind === "records" && mx.values.length > 0) return mx.values.every(isNullMx) ? noMail : OK;
  // No MX: the address records decide.
  if (!a || !aaaa) return UNKNOWN;
  if ((a.kind === "records" && a.values.length > 0) || (aaaa.kind === "records" && aaaa.values.length > 0)) return OK;
  if (a.kind === "error" || aaaa.kind === "error") return UNKNOWN;
  return noMail;
}

/** True when an MX answer is enough on its own, without asking for A/AAAA. */
export function mxIsConclusive(mx: Lookup): boolean {
  return mx.kind !== "nodata" && !(mx.kind === "records" && mx.values.length === 0);
}

/**
 * The reason an address can't receive mail, or null. Combines the per-address syntax check with a
 * verdict for its domain (from verifyAddress.ts on the server, or the composer's cache).
 */
export function addressProblem(email: string, domainVerdict: DomainVerdict | undefined): string | null {
  const syntax = syntaxProblem(email);
  if (syntax) return syntax;
  const known = staticVerdict(domainOf(email)) ?? domainVerdict;
  return known?.status === "bad" ? (known.reason ?? REASONS.no_mail) : null;
}
