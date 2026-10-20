"use client";

import LocalDate from "@/components/admin/LocalDate";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Customer } from "@/lib/store/types";
import { deleteCustomerAction } from "./actions";

function formatDate(iso: string) {
  return <LocalDate iso={iso} options={{ month: "short", day: "numeric", year: "numeric" }} />;
}

interface CustomersTableClientProps {
  customers: Customer[];
}

export default function CustomersTableClient({ customers }: CustomersTableClientProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  function handleDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This can't be undone.`)) return;
    startTransition(async () => {
      await deleteCustomerAction(id);
      router.refresh();
    });
  }

  if (customers.length === 0) {
    return (
      <div className="rounded-[2px] border border-[var(--color-border)] bg-[var(--color-bg-card)] p-8 text-center text-[var(--color-text-muted)]">
        No customers yet — convert a lead or add one manually.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[2px] border border-[var(--color-border)] bg-[var(--color-bg-card)]">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-[var(--color-border)] label-mono text-[var(--color-text-dim)]">
            <th className="px-5 py-3 font-medium">Business</th>
            <th className="px-5 py-3 font-medium">Contact</th>
            <th className="px-5 py-3 font-medium">Notes</th>
            <th className="px-5 py-3 font-medium">Customer since</th>
            <th className="px-5 py-3 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {customers.map((c) => (
            <tr key={c.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-white/[0.03]">
              <td className="px-5 py-4 font-medium text-[var(--color-text)]">{c.businessName}</td>
              <td className="px-5 py-4 text-[var(--color-text-muted)]">
                <div>{c.phone || "—"}</div>
                {c.email && <div className="text-xs text-[var(--color-text-dim)]">{c.email}</div>}
              </td>
              <td className="px-5 py-4 text-[var(--color-text-dim)]">{c.notes || "—"}</td>
              <td className="px-5 py-4 text-[var(--color-text-dim)]">{formatDate(c.createdAt)}</td>
              <td className="px-5 py-4 text-right">
                <button
                  type="button"
                  onClick={() => handleDelete(c.id, c.businessName)}
                  className="rounded-[2px] p-1.5 text-[var(--color-text-dim)] transition-colors hover:bg-red-400/10 hover:text-red-400"
                  aria-label={`Delete ${c.businessName}`}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 4h10M6.5 4V2.5h3V4M6 7v4M10 7v4M4 4l.5 9a1 1 0 001 1h5a1 1 0 001-1l.5-9" />
                  </svg>
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
