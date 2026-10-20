"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import LocalDate from "@/components/admin/LocalDate";
import type { Customer } from "@/lib/store/types";
import { deleteCustomerAction } from "./actions";

interface CustomersTableClientProps {
  customers: Customer[];
}

interface CustomerRowProps {
  customer: Customer;
  confirming: boolean;
  busy: boolean;
  onAskRemove: () => void;
  onKeep: () => void;
  onRemove: () => void;
}

/* One customer per row, the same stacked pattern as the Leads list: no table, works at 390px. */
function CustomerRow({ customer, confirming, busy, onAskRemove, onKeep, onRemove }: CustomerRowProps) {
  const contact = [customer.phone, customer.email].filter(Boolean);
  return (
    <li className="flex min-h-[56px] flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
      <div className="min-w-0 flex-1">
        <p className="text-base font-semibold text-[var(--color-text)]">{customer.businessName}</p>
        <p className="t-small mt-0.5 text-[var(--color-text-muted)]">
          {contact.length > 0 ? contact.join(" · ") : "No phone or email on file."}
        </p>
        <p className="t-small mt-0.5 text-[var(--color-text-dim)]">
          Customer since <LocalDate iso={customer.createdAt} options={{ month: "short", day: "numeric", year: "numeric" }} />
        </p>
        {customer.notes && <p className="t-small mt-1 truncate text-[var(--color-text-dim)]">{customer.notes}</p>}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
        {customer.fromLeadId && (
          <Link href={`/admin/leads/${customer.fromLeadId}`} className="btn-quiet">
            Lead history
          </Link>
        )}
        {confirming ? (
          <>
            <span className="t-small text-[var(--color-text-muted)]">Remove this customer?</span>
            <button type="button" onClick={onRemove} disabled={busy} className="btn-quiet text-[var(--color-danger)] hover:text-[var(--color-danger)]">
              Yes, remove
            </button>
            <button type="button" onClick={onKeep} disabled={busy} className="btn-quiet">
              Keep
            </button>
          </>
        ) : (
          <button type="button" onClick={onAskRemove} disabled={busy} className="btn-quiet">
            Remove
          </button>
        )}
      </div>
    </li>
  );
}

export default function CustomersTableClient({ customers }: CustomersTableClientProps) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  function removeCustomer(id: string) {
    startTransition(async () => {
      await deleteCustomerAction(id);
      setConfirmingId(null);
      router.refresh();
    });
  }

  if (customers.length === 0) {
    return (
      <div className="card p-8 text-center text-base text-[var(--color-text-muted)]">
        No customers yet. A deal marked Won lands here, or add one by hand.
      </div>
    );
  }

  return (
    <ul className="card divide-y divide-[var(--color-border)]">
      {customers.map((c) => (
        <CustomerRow
          key={c.id}
          customer={c}
          confirming={confirmingId === c.id}
          busy={busy}
          onAskRemove={() => setConfirmingId(c.id)}
          onKeep={() => setConfirmingId(null)}
          onRemove={() => removeCustomer(c.id)}
        />
      ))}
    </ul>
  );
}
