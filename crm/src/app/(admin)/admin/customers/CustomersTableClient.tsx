"use client";

import Link from "next/link";
import LocalDate from "@/components/admin/LocalDate";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Customer } from "@/lib/store/types";
import { Avatar, formatMoney } from "@/components/records/format";
import { ArrowIcon, MailIcon, PhoneIcon, TrashIcon } from "@/components/records/icons";
import { deleteCustomerAction } from "./actions";

// Customers as a clean list (v2): who they are, how to reach them, what they signed for, since when.
// The name opens the lead record, which holds the whole history.

interface CustomersTableClientProps {
  customers: Customer[];
  signed: Record<string, number>; // lead id -> value of won deals
}

export default function CustomersTableClient({ customers, signed }: CustomersTableClientProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleDelete(id: string, name: string) {
    if (!confirm(`Delete ${name} from customers? This can't be undone.`)) return;
    setError(null);
    startTransition(async () => {
      try {
        await deleteCustomerAction(id);
        router.refresh();
      } catch {
        setError(`Couldn't delete ${name}. Try again.`);
      }
    });
  }

  if (customers.length === 0) {
    return (
      <div className="card px-6 py-12 text-center">
        <p className="font-display text-[15px] tracking-[0.04em] text-[var(--color-steel)] uppercase">No customers yet</p>
        <p className="mt-2 text-[15px] text-[var(--color-text-muted)]">Win a deal on the Pipeline, or add a customer by hand.</p>
      </div>
    );
  }

  const grid = "md:grid md:grid-cols-[minmax(0,1.4fr)_minmax(0,1.2fr)_120px_140px_40px] md:items-center md:gap-6";

  return (
    <div className="card px-4 sm:px-6">
      {error && (
        <p role="alert" className="pt-4 text-[15px] text-[var(--color-hot)]">
          {error}
        </p>
      )}
      <div className={`hidden border-b border-[var(--color-border)] py-3 text-sm text-[var(--color-text-dim)] ${grid}`}>
        <span className="pl-[52px]">Business</span>
        <span>Contact</span>
        <span className="text-right">Signed</span>
        <span>Customer since</span>
        <span className="sr-only">Actions</span>
      </div>
      <ul>
        {customers.map((c) => {
          const value = c.fromLeadId ? signed[c.fromLeadId] : undefined;
          return (
            <li key={c.id} className={`group border-b border-[var(--color-border)] py-4 last:border-0 ${grid}`}>
              <div className="flex min-w-0 items-start gap-4">
                <Avatar name={c.businessName} size={36} className="mt-0.5" />
                <div className="min-w-0">
                  {c.fromLeadId ? (
                    <Link href={`/admin/leads/${c.fromLeadId}`} className="inline-flex items-center gap-2 text-[16px] font-semibold text-[var(--color-text)] hover:underline">
                      {c.businessName}
                      <ArrowIcon className="text-[var(--color-text-dim)] opacity-0 transition-opacity group-hover:opacity-100" />
                    </Link>
                  ) : (
                    <p className="text-[16px] font-semibold text-[var(--color-text)]">{c.businessName}</p>
                  )}
                  {c.notes && <p className="mt-0.5 line-clamp-2 text-[15px] text-[var(--color-text-muted)]">{c.notes}</p>}
                </div>
              </div>
              <div className="mt-3 space-y-1 pl-[52px] text-[15px] md:mt-0 md:pl-0">
                {c.email && (
                  <a href={`mailto:${c.email}`} className="flex min-w-0 items-center gap-2 text-[var(--color-text)] hover:underline">
                    <MailIcon className="text-[var(--color-text-dim)]" />
                    <span className="truncate">{c.email}</span>
                  </a>
                )}
                {c.phone && (
                  <a href={`tel:${c.phone.replace(/[^\d+]/g, "")}`} className="tabular flex items-center gap-2 text-[var(--color-text)] hover:underline">
                    <PhoneIcon className="text-[var(--color-text-dim)]" />
                    {c.phone}
                  </a>
                )}
                {!c.email && !c.phone && <span className="text-[var(--color-text-dim)]">No contact on file</span>}
              </div>
              <div className="mt-2 flex items-center justify-between gap-3 pl-[52px] md:contents">
                <p className="tabular text-[16px] text-[var(--color-text)] md:text-right">
                  {value ? formatMoney(value) : <span className="text-[15px] text-[var(--color-text-dim)]">—</span>}
                </p>
                <p className="text-[15px] whitespace-nowrap text-[var(--color-text-muted)]">
                  <span className="md:hidden">Since </span>
                  <LocalDate iso={c.createdAt} options={{ month: "short", day: "numeric", year: "numeric" }} />
                </p>
                <button
                  type="button"
                  onClick={() => handleDelete(c.id, c.businessName)}
                  disabled={pending}
                  className="grid h-9 w-9 place-items-center rounded-[var(--radius-sm)] text-[var(--color-text-dim)] transition-[opacity,color] hover:text-[var(--color-hot)] focus-visible:opacity-100 disabled:opacity-40 md:opacity-0 md:group-hover:opacity-100"
                  aria-label={`Delete ${c.businessName}`}
                >
                  <TrashIcon />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
