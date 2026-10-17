"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { BrandLockup, LiveryStripe } from "@/components/brand/BrandMark";

const MIN_LENGTH = 8;

// The browser client parses an implicit-flow token out of the URL fragment
// after mount, so a valid session can be a beat late. Give it a moment before
// declaring the link dead.
const SESSION_GRACE_MS = 2500;

type Status = "checking" | "ready" | "no-session";

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let settled = false;

    const markReady = () => {
      settled = true;
      setStatus("ready");
    };

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) markReady();
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) markReady();
    });

    const timer = setTimeout(() => {
      if (!settled) setStatus("no-session");
    }, SESSION_GRACE_MS);

    return () => {
      listener.subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < MIN_LENGTH) {
      setError(`Password must be at least ${MIN_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError("Both passwords must match.");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }

    router.push("/admin/dashboard");
    router.refresh();
  }

  return (
    <div className="w-full max-w-md px-6">
      <div className="rounded-[2px] border border-[var(--color-border)] bg-[var(--color-bg-card)] p-8 relative">
          <LiveryStripe className="absolute top-[-2px] left-8" />
        <div className="mb-8 text-center">
          <BrandLockup className="mb-6 justify-center" />
          <h1 className="text-xl font-semibold text-[var(--color-steel)]">Set Your Password</h1>
          <p className="mt-1.5 text-sm text-[var(--color-text-muted)]">Choose a new password for your admin account</p>
        </div>

        {status === "checking" && (
          <p className="py-6 text-center text-sm text-[var(--color-text-muted)]">Verifying your link...</p>
        )}

        {status === "no-session" && (
          <div className="space-y-5">
            <div className="rounded-[2px] border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              This link is invalid or has expired. Password links can only be used once, and they
              time out after a short window.
            </div>
            <a
              href="/admin/dashboard"
              className="block w-full rounded-[2px] bg-[var(--color-accent)] px-4 py-3 text-center font-display text-[11px] uppercase tracking-[var(--tracking-signage)] text-[var(--color-on-accent)] transition-all hover:bg-[var(--color-accent-hover)]"
            >
              Back to Dashboard
            </a>
          </div>
        )}

        {status === "ready" && (
          <>
            {error && (
              <div className="mb-6 rounded-[2px] border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-[var(--color-text-muted)]">
                  New password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={MIN_LENGTH}
                  autoComplete="new-password"
                  className="w-full rounded-[2px] border border-transparent bg-[var(--color-bg-secondary)] px-4 py-3 text-sm text-[var(--color-text)] placeholder-[var(--color-text-dim)] transition-colors outline-none focus:border-[var(--color-accent)]/50 focus:ring-1 focus:ring-[var(--color-accent)]/30"
                  placeholder={`At least ${MIN_LENGTH} characters`}
                />
              </div>

              <div>
                <label htmlFor="confirm" className="mb-1.5 block text-sm font-medium text-[var(--color-text-muted)]">
                  Confirm password
                </label>
                <input
                  id="confirm"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  minLength={MIN_LENGTH}
                  autoComplete="new-password"
                  className="w-full rounded-[2px] border border-transparent bg-[var(--color-bg-secondary)] px-4 py-3 text-sm text-[var(--color-text)] placeholder-[var(--color-text-dim)] transition-colors outline-none focus:border-[var(--color-accent)]/50 focus:ring-1 focus:ring-[var(--color-accent)]/30"
                  placeholder="Re-enter your password"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-[2px] bg-[var(--color-accent)] px-4 py-3 font-display text-[11px] uppercase tracking-[var(--tracking-signage)] text-[var(--color-on-accent)] transition-all hover:bg-[var(--color-accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Saving..." : "Save Password"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
