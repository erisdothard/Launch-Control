"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { checkDomainsAction } from "@/app/(admin)/admin/campaigns/actions";
import { addressProblem, domainOf, staticVerdict, syntaxProblem, type DomainVerdict } from "@/lib/email/addressCheck";
import { isValidEmail, type Candidate } from "./audience";

const DEBOUNCE_MS = 500;

/**
 * Which addresses on the list can't receive email, so step 1 can set them aside before saving.
 * Syntax and provider typos are judged here at once; each new domain is asked about once, in
 * debounced batches, by the server (DNS can't be done from a browser). The save action repeats
 * the whole check on fresh data, so this is a preview, never the gate. Demo mode stays offline:
 * its invented domains don't exist and would all read as dead.
 */
export function useAddressCheck(candidates: Candidate[], demo: boolean): { undeliverable: Map<string, string>; checking: boolean } {
  const [verdicts, setVerdicts] = useState<Record<string, DomainVerdict>>({});
  const [inFlight, setInFlight] = useState(0);
  const asked = useRef(new Set<string>());

  const emails = useMemo(() => [...new Set(candidates.map((c) => c.email.trim().toLowerCase()).filter(isValidEmail))], [candidates]);

  useEffect(() => {
    if (demo) return;
    const fresh = [...new Set(emails.filter((e) => !syntaxProblem(e)).map(domainOf))].filter((d) => d && !asked.current.has(d) && !staticVerdict(d));
    if (fresh.length === 0) return;
    // Only the wait is cancelled when the list changes again. A request already sent always lands:
    // verdicts are per domain, so a late answer is still right for whatever the list is now.
    const timer = setTimeout(async () => {
      fresh.forEach((d) => asked.current.add(d));
      setInFlight((n) => n + 1);
      const result = await checkDomainsAction(fresh).catch(() => null);
      setInFlight((n) => n - 1);
      // A failed check isn't retried here; the save runs it again.
      if (result?.ok && Object.keys(result.bad).length > 0) setVerdicts((prev) => ({ ...prev, ...result.bad }));
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [emails, demo]);

  const undeliverable = useMemo(() => {
    const out = new Map<string, string>();
    for (const email of emails) {
      const why = addressProblem(email, verdicts[domainOf(email)]);
      if (why) out.set(email, why);
    }
    return out;
  }, [emails, verdicts]);

  return { undeliverable, checking: inFlight > 0 };
}
