// How the mass email sender reads a failed send and an inbound reply. Pure, for node's test runner.

/**
 * The address itself is dead (RFC 3463 5.1.x "bad destination"): suppress it for good. Only
 * recipient-specific codes count. Policy blocks (5.7.x), size limits (552) and throttling say
 * nothing about the address and must never suppress it.
 */
export function isHardBounce(error: string): boolean {
  if (isSenderProblem(error)) return false;
  return (
    /\b5\.1\.(1|10)\b/.test(error) ||
    /recipient not found|user unknown/i.test(error) ||
    (/mailbox unavailable/i.test(error) && /\b5\.1\.\d+\b/.test(error))
  );
}

/**
 * The problem is on our side (the mailbox is blocked, rate-limited, over a size limit, or out of
 * its daily allowance), so sending to anyone else will fail the same way: pause the campaign.
 */
export function isSenderProblem(error: string): boolean {
  return (
    /\b5\.7\.\d+\b/.test(error) ||
    /\b552\b|\b5\.3\.4\b/.test(error) ||
    /\b4\.7\.\d+\b|\b421\b|\b451\b|\b452\b/.test(error) ||
    /throttl|rate limit|too many|try again later|daily (sending )?limit|quota|submission quota/i.test(error)
  );
}

/** An out-of-office or other automatic answer: not a reply from the person. */
export function isAutoReply(subject: string): boolean {
  return /^\s*(automatic reply|auto(matic)?[- ]?reply|autoreply|auto:|out of (the )?office)/i.test(subject);
}
