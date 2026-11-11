import "server-only";
import { Resolver } from "node:dns/promises";
import {
  addressProblem,
  domainOf,
  lookupFromError,
  mxIsConclusive,
  staticVerdict,
  syntaxProblem,
  verdictFromDns,
  type DomainVerdict,
  type Lookup,
} from "./addressCheck";

// Does a recipient's domain accept mail? Asked before a campaign is saved (and again, from the
// cache, right before each first email goes out), so an address that can only bounce is set aside
// instead of costing the new sending domain a bounce.
//
// Honest limits: this catches dead domains, domains that publish "no mail here", and typos of the
// big providers. It does NOT catch a misspelled mailbox at a real domain (jhon@acme.com): DNS can't
// see mailboxes, and probing the mail server for them (SMTP RCPT) is unreliable and itself hurts
// reputation. Those still bounce once; the worker suppresses hard bounces so it never happens twice.

/** Per DNS question. Most answers arrive in well under 100 ms; a slow server just means "unknown". */
const LOOKUP_TIMEOUT_MS = 2_000;
const OK_TTL_MS = 6 * 60 * 60_000;
const BAD_TTL_MS = 60 * 60_000;
/** Unknown (timeout, server error) is remembered briefly so a flaky resolver isn't hammered. */
const UNKNOWN_TTL_MS = 60_000;
const CACHE_MAX = 5_000;
const CONCURRENCY = 8;

const resolver = new Resolver({ timeout: LOOKUP_TIMEOUT_MS, tries: 1 });
const cache = new Map<string, { verdict: DomainVerdict; until: number }>();
const inFlight = new Map<string, Promise<DomainVerdict>>();

async function ask<T>(question: () => Promise<T[]>, toValues: (records: T[]) => string[]): Promise<Lookup> {
  try {
    return { kind: "records", values: toValues(await question()) };
  } catch (err) {
    return lookupFromError((err as NodeJS.ErrnoException | null)?.code);
  }
}

async function lookupDomain(domain: string): Promise<DomainVerdict> {
  const mx = await ask(() => resolver.resolveMx(domain), (r) => r.map((m) => m.exchange));
  if (mxIsConclusive(mx)) return verdictFromDns(mx);
  // No MX records: RFC 5321 falls back to the domain's own address.
  const [a, aaaa] = await Promise.all([ask(() => resolver.resolve4(domain), (r) => r), ask(() => resolver.resolve6(domain), (r) => r)]);
  return verdictFromDns(mx, a, aaaa);
}

function remember(domain: string, verdict: DomainVerdict): void {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  const ttl = verdict.status === "ok" ? OK_TTL_MS : verdict.status === "bad" ? BAD_TTL_MS : UNKNOWN_TTL_MS;
  cache.set(domain, { verdict, until: Date.now() + ttl });
}

/** A cached verdict without asking DNS, or undefined when there isn't a fresh one. */
export function cachedDomainVerdict(domain: string): DomainVerdict | undefined {
  const d = domain.trim().toLowerCase();
  const hit = cache.get(d);
  if (!hit) return undefined;
  if (hit.until < Date.now()) {
    cache.delete(d);
    return undefined;
  }
  return hit.verdict;
}

/** Whether `domain` accepts mail. Never throws; any failure is "unknown". */
export async function verifyDomain(domain: string): Promise<DomainVerdict> {
  const d = domain.trim().toLowerCase().replace(/\.$/, "");
  if (!d) return { status: "unknown" };
  const fixed = staticVerdict(d);
  if (fixed) return fixed;
  const cached = cachedDomainVerdict(d);
  if (cached) return cached;
  const pending = inFlight.get(d);
  if (pending) return pending;
  const job = lookupDomain(d)
    .catch((): DomainVerdict => ({ status: "unknown" }))
    .then((verdict) => {
      remember(d, verdict);
      return verdict;
    })
    .finally(() => inFlight.delete(d));
  inFlight.set(d, job);
  return job;
}

/**
 * Verdicts for many domains, a few at a time. Domains not answered within `budgetMs` are left out
 * (treated as fine by callers), so a save never hangs on DNS.
 */
export async function verifyDomains(domains: Iterable<string>, budgetMs = 6_000): Promise<Map<string, DomainVerdict>> {
  const queue = [...new Set([...domains].map((d) => d.trim().toLowerCase()).filter(Boolean))];
  const out = new Map<string, DomainVerdict>();
  const deadline = Date.now() + budgetMs;
  let next = 0;
  async function worker(): Promise<void> {
    while (next < queue.length && Date.now() < deadline) {
      const domain = queue[next++];
      out.set(domain, await verifyDomain(domain));
    }
  }
  const run = Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([run, new Promise<void>((resolve) => (timer = setTimeout(resolve, budgetMs)))]);
  clearTimeout(timer);
  // A copy: lookups still running past the deadline finish into the cache, not into this answer.
  return new Map(out);
}

/** address -> plain reason, for the addresses among `emails` that can't receive mail. */
export async function undeliverableAddresses(emails: Iterable<string>, budgetMs?: number): Promise<Map<string, string>> {
  const list = [...new Set([...emails].map((e) => e.trim().toLowerCase()).filter(Boolean))];
  const verdicts = await verifyDomains(
    list.filter((e) => !syntaxProblem(e)).map(domainOf),
    budgetMs
  );
  const out = new Map<string, string>();
  for (const email of list) {
    const why = addressProblem(email, verdicts.get(domainOf(email)));
    if (why) out.set(email, why);
  }
  return out;
}

/** One address, for a single send. Null when it can receive mail or we couldn't tell. */
export async function undeliverableReason(email: string): Promise<string | null> {
  const value = email.trim().toLowerCase();
  if (syntaxProblem(value)) return addressProblem(value, undefined);
  return addressProblem(value, await verifyDomain(domainOf(value)));
}
