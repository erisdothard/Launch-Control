import Link from "next/link";
import AdminHeader from "@/components/admin/AdminHeader";
import { getCustomers } from "@/lib/store/customers";
import CustomersTableClient from "./CustomersTableClient";

export default async function CustomersPage() {
  const customers = await getCustomers();

  return (
    <>
      <AdminHeader
        title="Customers"
        subtitle="Won deals and active clients."
        actions={
          <>
            <Link href="/admin/deals" className="link inline-flex min-h-[44px] items-center px-2">
              Deals board →
            </Link>
            <Link href="/admin/customers/new" className="btn btn-primary">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                <path d="M8 3v10M3 8h10" />
              </svg>
              Add customer
            </Link>
          </>
        }
      />
      <CustomersTableClient customers={customers} />
    </>
  );
}
