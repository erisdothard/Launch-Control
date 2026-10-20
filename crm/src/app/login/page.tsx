"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { BrandLockup, LiveryStripe } from "@/components/brand/BrandMark";

const labelClass = "mb-2 block text-base font-medium text-[var(--color-text)]";

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

    router.push("/admin/today");
    router.refresh();
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-[var(--color-bg-primary)] px-4 py-10">
      <div className="w-full max-w-md">
        <div className="card relative p-6 sm:p-8">
          <LiveryStripe className="absolute top-[-2px] left-6 sm:left-8" />
          <div className="mb-8 text-center">
            <BrandLockup className="mb-6 justify-center" />
            <h1 className="text-2xl font-semibold text-[var(--color-steel)]">Sign in</h1>
            <p className="mt-2 text-base text-[var(--color-text-muted)]">Your Launch Control CRM account.</p>
          </div>

          {error && (
            <div role="alert" className="mb-6 rounded-[2px] border border-[var(--color-danger)] bg-[var(--color-danger-bg)] px-4 py-3 text-base text-[var(--color-danger)]">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className={labelClass}>
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="input"
                placeholder="you@company.com"
              />
            </div>

            <div>
              <label htmlFor="password" className={labelClass}>
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="input"
                placeholder="Your password"
              />
            </div>

            <button type="submit" disabled={loading} className="btn btn-primary w-full">
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
