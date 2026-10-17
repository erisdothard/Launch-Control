import AdminShell from "@/components/admin/AdminShell";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { roleFromUser } from "@/lib/auth/roles";
import { getCompanyInfo } from "@/lib/store/company";
import { getUnreadCount } from "@/lib/store/messages";

// The CRM is always live, per-request data — there is nothing to prerender.
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const role = roleFromUser(user);
  const [company, unread] = await Promise.all([getCompanyInfo(), user ? getUnreadCount() : Promise.resolve(0)]);

  return (
    <div className="fixed inset-0 z-[100] flex bg-[var(--color-bg-primary)] text-[var(--color-text)]">
      <AdminShell role={role} userEmail={user?.email ?? ""} companyName={company.name} logoUrl={company.logoUrl} unread={unread}>
        {children}
      </AdminShell>
    </div>
  );
}
