import AdminShell from "@/components/admin/AdminShell";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { roleFromUser } from "@/lib/auth/roles";
import { getCompanyInfo } from "@/lib/store/company";
import { getUnreadCount } from "@/lib/store/messages";
import { getPendingDraftCount } from "@/lib/store/drafts";
import { isDemoMode } from "@/lib/demo/mode";
import { readDemoState } from "@/lib/demo/seed";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getNavOrder } from "@/lib/store/navOrder";

// The CRM is always live, per-request data — there is nothing to prerender.
export const dynamic = "force-dynamic";

// The demo deployment keeps its walkthrough step in the demo schema; the real CRM has none.
async function demoState(): Promise<{ step: number } | null> {
  if (!isDemoMode()) return null;
  const db = createServiceRoleClient();
  if (!db) return { step: 0 };
  return { step: (await readDemoState(db)).step };
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const role = roleFromUser(user);
  const [company, unread, drafts, demo, navOrder] = await Promise.all([
    getCompanyInfo(),
    user ? getUnreadCount() : Promise.resolve(0),
    user ? getPendingDraftCount() : Promise.resolve(0),
    demoState(),
    getNavOrder(user?.email),
  ]);

  return (
    <div className="fixed inset-0 z-[100] flex bg-[var(--color-bg-primary)] text-[var(--color-text)]">
      <AdminShell role={role} userEmail={user?.email ?? ""} companyName={company.name} logoUrl={company.logoUrl} unread={unread} drafts={drafts} userId={user?.id ?? ""} navOrder={navOrder} demo={demo}>
        {children}
      </AdminShell>
    </div>
  );
}
