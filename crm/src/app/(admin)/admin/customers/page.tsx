import Link from "next/link";
import AdminHeader from "@/components/admin/AdminHeader";
import { getCustomers } from "@/lib/store/customers";
import { getDeals } from "@/lib/store/deals";
import CustomersTableClient from "./CustomersTableClient";

const WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve"];

export default async function CustomersPage() {
  const [customers, deals] = await Promise.all([getCustomers(), getDeals()]);
  // What each customer signed for: the won deals opened from the lead they came from.
  const signed: Record<string, number> = {};
  for (const d of deals) if (d.stage === "won" && d.fromLeadId) signed[d.fromLeadId] = (signed[d.fromLeadId] ?? 0) + d.value;
  const n = customers.length;
  const subtitle =
    n === 0
      ? "Nobody has signed yet. When a deal is won, the business shows up here."
      : `${WORDS[n] ?? n} ${n === 1 ? "business has" : "businesses have"} signed. Open one to see how they got here.`;

  return (
    <>
      <AdminHeader
        title="Customers"
        subtitle={subtitle}
        actions={
          <Link href="/admin/customers/new" className="btn btn-secondary">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
              <path d="M8 3v10M3 8h10" />
            </svg>
            Add customer
          </Link>
        }
      />
      <CustomersTableClient customers={customers} signed={signed} />
    </>
  );
}
