// Demo mode: the same CRM, pointed at the `demo` schema of the same Supabase project, with a
// visitor signed in automatically as the demo user. Max opens it in front of a client (or sends
// them the link); nothing in it is real and nothing it "sends" leaves the database.
// Turn it on per deployment with NEXT_PUBLIC_DEMO_MODE=1 (the demo Vercel project sets it; the
// real CRM never does). DEMO_LOGIN_EMAIL / DEMO_LOGIN_PASSWORD name the demo user, who is on
// demo.crm_users and nothing else.

export const DEMO_SCHEMA = "demo";

export function isDemoMode(): boolean {
  return process.env.NEXT_PUBLIC_DEMO_MODE === "1";
}

/**
 * supabase-js options that route every query to the demo schema. The generated Database type
 * only knows `public`; the demo schema is a column-for-column copy, so the cast is honest.
 */
export function demoDbOptions(): { db?: { schema: "public" } } {
  return isDemoMode() ? { db: { schema: DEMO_SCHEMA as "public" } } : {};
}

export function demoLogin(): { email: string; password: string } | null {
  const email = process.env.DEMO_LOGIN_EMAIL;
  const password = process.env.DEMO_LOGIN_PASSWORD;
  return email && password ? { email, password } : null;
}
