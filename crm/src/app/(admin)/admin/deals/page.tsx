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
        subtitle="Pipeline from first contact to signed. Drag a deal between columns, or use its Move to list."
        actions={
          <Link href="/admin/deals/new" className="btn btn-primary">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
              <path d="M8 3v10M3 8h10" />
            </svg>
            Add deal
          </Link>
        }
      />
      <DealsKanbanClient deals={deals} />
    </>
  );
}
