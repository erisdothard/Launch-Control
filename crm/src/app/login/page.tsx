"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { BrandLockup, LiveryStripe } from "@/components/brand/BrandMark";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg-primary)] px-6">
      <div className="w-full max-w-md">
        <div className="rounded-[2px] border border-[var(--color-border)] bg-[var(--color-bg-card)] p-8 relative">
          <LiveryStripe className="absolute top-[-2px] left-8" />
          <div className="mb-8 text-center">
            <BrandLockup className="mb-6 justify-center" />
            <h1 className="text-xl font-semibold text-[var(--color-steel)]">Launch Control CRM</h1>
            <p className="mt-1.5 text-sm text-[var(--color-text-muted)]">Sign in to your account</p>
          </div>

          {error && (
            <div className="mb-6 rounded-[2px] border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-[var(--color-text-muted)]">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full rounded-[2px] border border-transparent bg-[var(--color-bg-secondary)] px-4 py-3 text-sm text-[var(--color-text)] placeholder-[var(--color-text-dim)] transition-colors outline-none focus:border-[var(--color-accent)]/50 focus:ring-1 focus:ring-[var(--color-accent)]/30"
                placeholder="you@company.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-[var(--color-text-muted)]">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full rounded-[2px] border border-transparent bg-[var(--color-bg-secondary)] px-4 py-3 text-sm text-[var(--color-text)] placeholder-[var(--color-text-dim)] transition-colors outline-none focus:border-[var(--color-accent)]/50 focus:ring-1 focus:ring-[var(--color-accent)]/30"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-[2px] bg-[var(--color-accent)] px-4 py-3 font-display text-[11px] uppercase tracking-[var(--tracking-signage)] text-[var(--color-on-accent)] transition-all hover:bg-[var(--color-accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
