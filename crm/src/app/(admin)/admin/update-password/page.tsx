"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { BrandLockup } from "@/components/brand/BrandMark";

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

    router.push("/admin/dashboard");
    router.refresh();
  }

  return (
    <div className="w-full max-w-[440px] px-4 sm:px-6">
      <BrandLockup className="mb-8 justify-center" />
      <div className="card relative overflow-hidden px-6 py-8 sm:px-10 sm:py-10">
        <div aria-hidden="true" className="absolute top-0 bottom-0 left-0 flex w-[5px] flex-col">
          <span className="flex-[5] bg-[var(--color-accent)]" />
          <span className="flex-[3] bg-[var(--color-livery-orange)]" />
          <span className="flex-[2] bg-[var(--color-livery-red)]" />
        </div>
        <h1 className="text-[32px] leading-[1.1] font-semibold tracking-[-0.03em] text-[var(--color-steel)]">Set your password</h1>
        <p className="mt-2 text-base text-[var(--color-text-muted)]">Choose the password you will sign in with from now on.</p>

        {status === "checking" && <p className="mt-7 text-base text-[var(--color-text-muted)]">Checking your link...</p>}

        {status === "no-session" && (
          <div className="mt-7 space-y-5">
            <p role="alert" className="well px-4 py-3 text-base text-[var(--color-hot)]">
              This link has expired or was already used. Password links work once and only for a short time.
            </p>
            <a href="/admin/dashboard" className="btn btn-secondary w-full">
              Back to the CRM
            </a>
          </div>
        )}

        {status === "ready" && (
          <>
            {error && (
              <p role="alert" className="well mt-6 px-4 py-3 text-base text-[var(--color-hot)]">
                {error}
              </p>
            )}

            <form onSubmit={handleSubmit} className="mt-7 space-y-5">
              <div>
                <label htmlFor="password" className="mb-1.5 block text-sm text-[var(--color-text-dim)]">
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
                  className="field"
                  placeholder={`At least ${MIN_LENGTH} characters`}
                />
              </div>

              <div>
                <label htmlFor="confirm" className="mb-1.5 block text-sm text-[var(--color-text-dim)]">
                  Type it again
                </label>
                <input
                  id="confirm"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  minLength={MIN_LENGTH}
                  autoComplete="new-password"
                  className="field"
                  placeholder="The same password"
                />
              </div>

              <button type="submit" disabled={loading} className="btn btn-primary mt-2 w-full">
                {loading ? "Saving..." : "Save password"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
