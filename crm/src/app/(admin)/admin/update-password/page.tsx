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

const labelClass = "mb-2 block text-base font-medium text-[var(--color-text)]";
const alertClass = "rounded-[2px] border border-[var(--color-danger)] bg-[var(--color-danger-bg)] px-4 py-3 text-base text-[var(--color-danger)]";

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

    // Invite and recovery links from the admin API use the implicit flow (#access_token=...), but
    // the @supabase/ssr browser client runs PKCE and ignores fragments, so set the session by hand.
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = fragment.get("access_token");
    const refreshToken = fragment.get("refresh_token");
    if (accessToken && refreshToken) {
      window.history.replaceState(null, "", window.location.pathname);
      supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken }).then(({ data }) => {
        if (data.session) markReady();
      });
    } else {
      supabase.auth.getSession().then(({ data }) => {
        if (data.session) markReady();
      });
    }

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

    router.push("/admin/today");
    router.refresh();
  }

  return (
    <div className="w-full max-w-md px-4 py-10">
      <div className="card relative p-6 sm:p-8">
        <LiveryStripe className="absolute top-[-2px] left-6 sm:left-8" />
        <div className="mb-8 text-center">
          <BrandLockup className="mb-6 justify-center" />
          <h1 className="text-2xl font-semibold text-[var(--color-steel)]">Set your password</h1>
          <p className="mt-2 text-base text-[var(--color-text-muted)]">Choose a new password for your account.</p>
        </div>

        {status === "checking" && <p className="py-6 text-center text-base text-[var(--color-text-muted)]">Checking your link...</p>}

        {status === "no-session" && (
          <div className="space-y-5">
            <div role="alert" className={alertClass}>
              This link is invalid or has expired. Password links can only be used once, and they time out after a short window.
            </div>
            <a href="/admin/today" className="btn btn-primary w-full">
              Back to Today
            </a>
          </div>
        )}

        {status === "ready" && (
          <>
            {error && (
              <div role="alert" className={`mb-6 ${alertClass}`}>
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="password" className={labelClass}>
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
                  className="input"
                  placeholder={`At least ${MIN_LENGTH} characters`}
                />
              </div>

              <div>
                <label htmlFor="confirm" className={labelClass}>
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
                  className="input"
                  placeholder="Type it again"
                />
              </div>

              <button type="submit" disabled={loading} className="btn btn-primary w-full">
                {loading ? "Saving..." : "Save password"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
