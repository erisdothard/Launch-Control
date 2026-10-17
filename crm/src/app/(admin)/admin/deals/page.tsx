import Link from "next/link";
import AdminHeader from "@/components/admin/AdminHeader";
import { getDeals } from "@/lib/store/deals";
import DealsKanbanClient from "./DealsKanbanClient";

export default async function DealsPage() {
  const deals = await getDeals();

  return (
    <>
      <AdminHeader
        title="Deals"
        subtitle="Pipeline from first contact to signed."
        actions={
          <Link
            href="/admin/deals/new"
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-[2px] bg-[var(--color-accent)] px-4 py-2 font-display text-[11px] uppercase tracking-[var(--tracking-signage)] text-[var(--color-on-accent)] transition-colors hover:bg-[var(--color-accent-hover)]"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M8 3v10M3 8h10" />
            </svg>
            Add Deal
          </Link>
        }
      />
      <DealsKanbanClient deals={deals} />
    </>
  );
}
