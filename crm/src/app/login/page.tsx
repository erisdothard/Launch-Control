"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { BrandLockup } from "@/components/brand/BrandMark";

const DENIED_MESSAGE = "That account isn't on the Launch Control team list. Sign in with your team email, or ask Eris to add you.";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // The admin proxy sends signed-in users who aren't on the team allowlist here with ?denied=1.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("denied") !== "1") return;
    void createClient()
      .auth.signOut()
      .finally(() => setError(DENIED_MESSAGE));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }

    router.push("/admin/dashboard");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg-sidebar)] px-4 py-10 sm:px-6">
      <div className="w-full max-w-[440px]">
        <BrandLockup className="mb-8 justify-center" />
        <div className="card relative overflow-hidden px-6 py-8 sm:px-10 sm:py-10">
          <div aria-hidden="true" className="absolute top-0 bottom-0 left-0 flex w-[5px] flex-col">
            <span className="flex-[5] bg-[var(--color-accent)]" />
            <span className="flex-[3] bg-[var(--color-livery-orange)]" />
            <span className="flex-[2] bg-[var(--color-livery-red)]" />
          </div>
          <h1 className="text-[32px] leading-[1.1] font-semibold tracking-[-0.03em] text-[var(--color-steel)]">Sign in</h1>
          <p className="mt-2 text-base text-[var(--color-text-muted)]">Use the email and password for your Launch Control account.</p>

          {error && (
            <p role="alert" className="well mt-6 px-4 py-3 text-base text-[var(--color-hot)]">
              {error}
            </p>
          )}

          <form onSubmit={handleSubmit} className="mt-7 space-y-5">
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm text-[var(--color-text-dim)]">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="field"
                placeholder="you@company.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm text-[var(--color-text-dim)]">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="field"
                placeholder="••••••••"
              />
            </div>

            <button type="submit" disabled={loading} className="btn btn-primary mt-2 w-full">
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
