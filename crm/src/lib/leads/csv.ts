// Spreadsheet import: parse a CSV export (Google Sheets, Excel, Apollo, etc.) and map its columns
// onto lead fields by header name. Pure, so the browser can preview before anything is saved.

export interface ImportRow {
  businessName: string;
  email: string;
  phone: string;
  website: string;
  contactName: string;
  notes: string;
}

export type ImportField = keyof ImportRow;

// Header spellings seen in common exports, compared after lower-casing and stripping non-letters.
const HEADER_ALIASES: Record<ImportField, string[]> = {
  businessName: ["business", "businessname", "company", "companyname", "organization", "organisation", "account", "accountname", "name"],
  email: ["email", "emailaddress", "workemail", "contactemail", "mail"],
  phone: ["phone", "phonenumber", "telephone", "tel", "mobile", "cell", "workphone", "companyphone"],
  website: ["website", "url", "site", "domain", "companywebsite", "web"],
  contactName: ["contact", "contactname", "fullname", "person", "owner", "firstname"],
  notes: ["notes", "note", "comments", "comment", "description"],
};

/** RFC 4180-ish: quoted fields, doubled quotes, commas and newlines inside quotes, CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

const key = (header: string) => header.toLowerCase().replace(/[^a-z]/g, "");

/** Column index per field; first matching header wins, and a column is used for one field only. */
export function mapHeaders(headers: string[]): Partial<Record<ImportField, number>> {
  const keys = headers.map(key);
  const used = new Set<number>();
  const map: Partial<Record<ImportField, number>> = {};
  for (const field of Object.keys(HEADER_ALIASES) as ImportField[]) {
    for (const alias of HEADER_ALIASES[field]) {
      const idx = keys.findIndex((k, i) => k === alias && !used.has(i));
      if (idx !== -1) {
        map[field] = idx;
        used.add(idx);
        break;
      }
    }
  }
  return map;
}

export interface ParsedImport {
  rows: ImportRow[];
  mapped: ImportField[];
  skippedNoName: number;
}

export const MAX_IMPORT_ROWS = 1000;

export function readImport(text: string): ParsedImport {
  const [headers = [], ...body] = parseCsv(text);
  const map = mapHeaders(headers);
  const lastNameIdx = headers.map(key).findIndex((k) => k === "lastname" || k === "surname");
  const cell = (r: string[], f: ImportField) => (map[f] === undefined ? "" : (r[map[f]!] ?? "").trim());

  let skippedNoName = 0;
  const rows: ImportRow[] = [];
  for (const r of body.slice(0, MAX_IMPORT_ROWS)) {
    let contactName = cell(r, "contactName");
    if (contactName && lastNameIdx !== -1 && headers.map(key)[map.contactName!] === "firstname") {
      contactName = `${contactName} ${(r[lastNameIdx] ?? "").trim()}`.trim();
    }
    const row: ImportRow = {
      businessName: cell(r, "businessName"),
      email: cell(r, "email").toLowerCase(),
      phone: cell(r, "phone"),
      website: cell(r, "website"),
      contactName,
      notes: cell(r, "notes"),
    };
    // No business column but a website: name the lead after the site so it isn't lost.
    if (!row.businessName && row.website) row.businessName = row.website.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/.*$/, "");
    if (!row.businessName) {
      skippedNoName++;
      continue;
    }
    rows.push(row);
  }
  return { rows, mapped: Object.keys(map) as ImportField[], skippedNoName };
}
