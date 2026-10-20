"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { readImport, MAX_IMPORT_ROWS, type ImportField, type ParsedImport } from "@/lib/leads/csv";
import type { ImportResult } from "@/lib/store/leads";
import { importLeadsAction } from "../actions";

const FIELD_LABEL: Record<ImportField, string> = {
  businessName: "Business",
  email: "Email",
  phone: "Phone",
  website: "Website",
  contactName: "Contact",
  notes: "Notes",
};
const PREVIEW_ROWS = 8;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

export default function ImportLeadsClient() {
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<ParsedImport | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function handleFile(file: File | undefined) {
    setResult(null);
    setError(null);
    setParsed(null);
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setError("That file is over 5 MB. Split it into smaller files.");
      return;
    }
    setFileName(file.name);
    const next = readImport(await file.text());
    if (!next.mapped.includes("businessName") && !next.mapped.includes("website")) {
      setError("Couldn't find a business name or website column. Add a header row with “Company” or “Website”.");
      return;
    }
    if (next.rows.length === 0) {
      setError("No rows with a business name in that file.");
      return;
    }
    setParsed(next);
  }

  function handleImport() {
    if (!parsed) return;
    startTransition(async () => {
      const res = await importLeadsAction(parsed.rows, fileName);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setResult(res.result);
      setParsed(null);
    });
  }

  return (
    <div className="max-w-4xl space-y-6">
      <section className="card p-6">
        <p className="text-[var(--color-text-muted)]">
          Export your sheet as <span className="font-medium text-[var(--color-text)]">CSV</span> (Google Sheets: File → Download → .csv). The
          first row should be headers. Columns we pick up: Company, Email, Phone, Website, Contact (or First/Last Name) and Notes. Up to{" "}
          {MAX_IMPORT_ROWS} rows per file.
        </p>
        <label className="mt-5 inline-flex min-h-[var(--control-height)] cursor-pointer items-center gap-3 rounded-[2px] border border-dashed border-[var(--color-border-bright)] px-5 py-4 text-[var(--color-text)] transition-colors hover:border-[var(--color-accent-hover)]">
          <span className="font-medium">{fileName || "Choose a CSV file"}</span>
          <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => handleFile(e.target.files?.[0])} disabled={pending} />
        </label>
        {error && (
          <p role="alert" className="mt-4 text-[var(--color-danger)]">
            {error}
          </p>
        )}
      </section>

      {parsed && (
        <section className="card">
          <div className="flex flex-col gap-3 border-b border-[var(--color-border)] px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium text-[var(--color-text)]">{parsed.rows.length} rows ready</p>
              <p className="t-small text-[var(--color-text-dim)]">
                Found: {parsed.mapped.map((f) => FIELD_LABEL[f]).join(", ")}
                {parsed.skippedNoName > 0 && ` · ${parsed.skippedNoName} rows without a name will be skipped`}
              </p>
            </div>
            <button type="button" onClick={handleImport} disabled={pending} className="btn btn-primary">
              {pending ? "Importing..." : `Import ${parsed.rows.length}`}
            </button>
          </div>
          {/* Preview only; the primary list is on the Leads page. */}
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="label-mono border-b border-[var(--color-border)] text-[var(--color-text-dim)]">
                  {(["businessName", "contactName", "email", "phone", "website"] as const).map((f) => (
                    <th key={f} className="px-5 py-3 font-medium">
                      {FIELD_LABEL[f]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parsed.rows.slice(0, PREVIEW_ROWS).map((r, i) => (
                  <tr key={i} className="border-b border-[var(--color-border)] last:border-0">
                    <td className="px-5 py-3 text-[var(--color-text)]">{r.businessName}</td>
                    <td className="px-5 py-3 text-[var(--color-text-muted)]">{r.contactName || "—"}</td>
                    <td className="px-5 py-3 text-[var(--color-text-muted)]">{r.email || "—"}</td>
                    <td className="px-5 py-3 whitespace-nowrap text-[var(--color-text-muted)]">{r.phone || "—"}</td>
                    <td className="max-w-[12rem] truncate px-5 py-3 text-[var(--color-text-muted)]">{r.website || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {parsed.rows.length > PREVIEW_ROWS && (
            <p className="t-small px-6 py-3 text-[var(--color-text-dim)]">and {parsed.rows.length - PREVIEW_ROWS} more</p>
          )}
        </section>
      )}

      {result && (
        <section role="status" className="card border-[var(--color-accent-border)] p-6">
          <p className="font-medium text-[var(--color-text)]">
            Added {result.added} lead{result.added === 1 ? "" : "s"}.
            {result.duplicates.length > 0 && ` Skipped ${result.duplicates.length} already in the CRM.`}
          </p>
          {result.duplicates.length > 0 && (
            <ul className="t-small mt-3 max-h-60 space-y-1 overflow-y-auto text-[var(--color-text-muted)]">
              {result.duplicates.map((d, i) => (
                <li key={i}>
                  {d.businessName}
                  {d.matches !== d.businessName && <span className="text-[var(--color-text-dim)]"> (matches {d.matches})</span>}
                </li>
              ))}
            </ul>
          )}
          <Link href="/admin/leads?view=not-contacted" className="btn btn-secondary mt-4">
            See the new leads
          </Link>
        </section>
      )}
    </div>
  );
}
