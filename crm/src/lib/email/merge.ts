// Mail merge for mass email. Pure functions, no imports: the composer runs them in the browser for
// the live preview and the sending route runs the same ones on the server, so what Max sees is
// what goes out. Output is plain text; the HTML path (signature.ts emailHtml) does the escaping.
//
// Syntax: {{first_name}} inserts the value, {{first_name|there}} falls back to "there" when the
// recipient has no first name. Field names are case-insensitive; spaces inside the braces are fine.

export type MergeValues = Record<string, string>;

export interface MergeField {
  key: string;
  label: string;
  /** What it looks like for a typical recipient, shown in the insert menu. */
  example: string;
}

export const MERGE_FIELDS: readonly MergeField[] = [
  { key: "first_name", label: "First name", example: "Dana" },
  { key: "last_name", label: "Last name", example: "Reyes" },
  { key: "full_name", label: "Full name", example: "Dana Reyes" },
  { key: "company", label: "Company", example: "Ridge Motorsport" },
  { key: "email", label: "Email address", example: "dana@ridgemotorsport.com" },
  { key: "city", label: "City", example: "Nashville" },
  { key: "state", label: "State", example: "TN" },
  { key: "website", label: "Website", example: "ridgemotorsport.com" },
  { key: "phone", label: "Phone", example: "(615) 555-0142" },
  { key: "title", label: "Job title", example: "Head of Events" },
];

const TOKEN = /\{\{\s*([a-zA-Z][a-zA-Z0-9_ ]*?)\s*(?:\|([^}]*))?\}\}/g;

export interface MergeToken {
  field: string;
  fallback: string | null;
}

export function normalizeField(name: string): string {
  return name.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

/** Every {{field}} in a template, in order, with its fallback if one was given. */
export function parseTokens(template: string): MergeToken[] {
  const out: MergeToken[] = [];
  for (const m of template.matchAll(TOKEN)) {
    out.push({ field: normalizeField(m[1]), fallback: m[2] === undefined ? null : m[2].trim() });
  }
  return out;
}

/** The template with each {{field}} replaced by the recipient's value, its fallback, or nothing. */
export function renderMerge(template: string, values: MergeValues): string {
  const rendered = template.replace(TOKEN, (_all, name: string, fallback: string | undefined) => {
    const value = (values[normalizeField(name)] ?? "").trim();
    return value || (fallback ?? "").trim();
  });
  // "Hi ," when a field is empty with no fallback: tidy the space before punctuation.
  return rendered.replace(/[ \t]+([,.!?;:])/g, "$1");
}

/** Fields a recipient lacks that are used somewhere without a fallback (they'd come out blank). */
export function missingFields(templates: string[], values: MergeValues): string[] {
  const missing = new Set<string>();
  for (const t of templates) {
    for (const token of parseTokens(t)) {
      if (token.fallback) continue;
      if (!(values[token.field] ?? "").trim()) missing.add(token.field);
    }
  }
  return [...missing];
}

/** Fields used anywhere in the templates (for "who is missing what" warnings). */
export function usedFields(templates: string[]): string[] {
  return [...new Set(templates.flatMap((t) => parseTokens(t).map((x) => x.field)))];
}

export function fieldLabel(key: string): string {
  return MERGE_FIELDS.find((f) => f.key === key)?.label ?? key.replace(/_/g, " ");
}

/** "Dana Reyes" -> Dana / Reyes. "Dr. Dana M. Reyes Jr." -> Dana / Reyes. */
export function splitName(full: string): { first: string; last: string } {
  const parts = full
    .replace(/[(),]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((p) => !/^(mr|mrs|ms|dr|jr|sr|ii|iii|iv)\.?$/i.test(p));
  if (parts.length === 0) return { first: "", last: "" };
  const first = parts[0];
  const last = parts.length > 1 ? parts[parts.length - 1] : "";
  return { first: /^[A-Z]\.?$/.test(first) && parts[1] ? parts[1] : first, last };
}

/** Fill the name fields from whatever is known, without overwriting values that were given. */
export function completeValues(values: MergeValues): MergeValues {
  const out: MergeValues = {};
  for (const [k, v] of Object.entries(values)) {
    const key = normalizeField(k);
    const value = (v ?? "").trim();
    if (value) out[key] = value;
  }
  if (!out.full_name && (out.first_name || out.last_name)) out.full_name = [out.first_name, out.last_name].filter(Boolean).join(" ");
  if (out.full_name && (!out.first_name || !out.last_name)) {
    const { first, last } = splitName(out.full_name);
    if (!out.first_name && first) out.first_name = first;
    if (!out.last_name && last) out.last_name = last;
  }
  if (out.email) out.email = out.email.toLowerCase();
  return out;
}

// ---------------------------------------------------------------------------------------------
// Pasted lists and CSV files. Accepts:
//   - a CSV with a header row (any order; name/email/company columns are recognised by name),
//   - a CSV without a header (the column holding addresses is found by looking at the values),
//   - plain addresses separated by commas, semicolons, spaces or new lines,
//   - "Dana Reyes <dana@ridge.com>" lines, as copied out of Outlook.
// ---------------------------------------------------------------------------------------------

export interface ParsedContact {
  email: string;
  values: MergeValues;
}

export interface ParsedList {
  contacts: ParsedContact[];
  /** Lines that held no email address, so Max can see what was dropped. */
  rejected: string[];
  /** Merge fields the columns became, e.g. ["first_name", "company", "industry"]. */
  columns: string[];
}

const EMAIL_IN_TEXT = /[^\s@<>,;:"'()[\]]+@[^\s@<>,;:"'()[\]]+\.[a-z]{2,}/i;

// Header names people actually use, mapped to merge fields.
const HEADER_ALIASES: Record<string, string> = {
  email: "email",
  e_mail: "email",
  email_address: "email",
  emailaddress: "email",
  mail: "email",
  name: "full_name",
  full_name: "full_name",
  fullname: "full_name",
  contact: "full_name",
  contact_name: "full_name",
  first: "first_name",
  first_name: "first_name",
  firstname: "first_name",
  given_name: "first_name",
  last: "last_name",
  last_name: "last_name",
  lastname: "last_name",
  surname: "last_name",
  family_name: "last_name",
  company: "company",
  company_name: "company",
  business: "company",
  business_name: "company",
  organization: "company",
  organisation: "company",
  account: "company",
  city: "city",
  town: "city",
  state: "state",
  province: "state",
  region: "state",
  website: "website",
  url: "website",
  domain: "website",
  phone: "phone",
  phone_number: "phone",
  mobile: "phone",
  title: "title",
  job_title: "title",
  position: "title",
  role: "title",
};

/** One CSV line into cells, honouring "quoted, cells" and "" escapes. Tabs work too (Excel paste). */
export function splitCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"' && cur.trim() === "") {
      quoted = true;
      cur = "";
    } else if (ch === delimiter) {
      cells.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

function headerField(cell: string): string | null {
  const key = normalizeField(cell.replace(/[^a-zA-Z0-9 _-]/g, ""));
  if (!key) return null;
  return HEADER_ALIASES[key] ?? HEADER_ALIASES[key.replace(/_/g, "")] ?? null;
}

function pickDelimiter(lines: string[]): string {
  const sample = lines.slice(0, 5).join("\n");
  const tabs = (sample.match(/\t/g) ?? []).length;
  const commas = (sample.match(/,/g) ?? []).length;
  const semis = (sample.match(/;/g) ?? []).length;
  if (tabs >= commas && tabs >= semis && tabs > 0) return "\t";
  return semis > commas ? ";" : ",";
}

function looksTabular(lines: string[], delimiter: string): boolean {
  // A table: most rows have as many cells as the first, and no row holds more than one address.
  // Stray lines (a note, a blank-ish row) don't stop it being a table; they're reported as rejected.
  const sample = lines.slice(0, 50);
  const width = splitCsvLine(sample[0], delimiter).length;
  if (width < 2) return false;
  const same = sample.filter((l) => splitCsvLine(l, delimiter).length === width).length;
  const addressesPerLine = sample.map((l) => (l.match(new RegExp(EMAIL_IN_TEXT.source, "gi")) ?? []).length);
  return same / sample.length >= 0.7 && addressesPerLine.every((n) => n <= 1);
}

function parseLoose(text: string): ParsedList {
  const contacts: ParsedContact[] = [];
  const rejected: string[] = [];
  // Split on new lines and on separators that sit between addresses.
  const pieces = text.split(/\r?\n|;|,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((p) => p.trim()).filter(Boolean);
  for (const piece of pieces) {
    const found = piece.match(new RegExp(EMAIL_IN_TEXT.source, "gi"));
    if (!found) {
      rejected.push(piece);
      continue;
    }
    if (found.length === 1) {
      // "Dana Reyes <dana@ridge.com>" or "dana@ridge.com (Dana Reyes)": keep the name.
      const name = piece.replace(found[0], "").replace(/[<>()"']/g, " ").replace(/\s+/g, " ").trim();
      contacts.push({ email: found[0].toLowerCase(), values: completeValues({ email: found[0], full_name: name }) });
    } else {
      for (const e of found) contacts.push({ email: e.toLowerCase(), values: { email: e.toLowerCase() } });
    }
  }
  return { contacts, rejected, columns: contacts.some((c) => c.values.full_name) ? ["email", "full_name"] : ["email"] };
}

/** Parse a pasted list or CSV file into contacts with merge values. Never throws. */
export function parseRecipientList(text: string): ParsedList {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => l.trim());
  if (lines.length === 0) return { contacts: [], rejected: [], columns: [] };
  const delimiter = pickDelimiter(lines);
  if (!looksTabular(lines, delimiter)) return parseLoose(text);

  const first = splitCsvLine(lines[0], delimiter);
  const headerFields = first.map(headerField);
  const hasHeader = !EMAIL_IN_TEXT.test(lines[0]) && headerFields.some(Boolean);

  let fields: (string | null)[];
  let rows: string[];
  if (hasHeader) {
    // Unknown headers still become merge fields ({{industry}}), named after the header.
    fields = first.map((cell, i) => headerFields[i] ?? (normalizeField(cell.replace(/[^a-zA-Z0-9 _-]/g, "")) || null));
    rows = lines.slice(1);
  } else {
    // No header: find the address column by content; guess a name column beside it.
    const cells = lines.map((l) => splitCsvLine(l, delimiter));
    const width = cells[0].length;
    const emailCol = [...Array(width).keys()].find((i) => cells.every((r) => !r[i] || EMAIL_IN_TEXT.test(r[i]))) ?? -1;
    fields = [...Array(width).keys()].map((i) => {
      if (i === emailCol) return "email";
      if (i === (emailCol === 0 ? 1 : 0)) return "full_name";
      if (i === (emailCol <= 1 ? 2 : 1)) return "company";
      return null;
    });
    rows = lines;
  }

  const contacts: ParsedContact[] = [];
  const rejected: string[] = [];
  for (const line of rows) {
    const cells = splitCsvLine(line, delimiter);
    const raw: MergeValues = {};
    fields.forEach((f, i) => {
      if (f && cells[i]) raw[f] = cells[i];
    });
    const address = (raw.email ?? "").match(EMAIL_IN_TEXT)?.[0] ?? cells.join(" ").match(EMAIL_IN_TEXT)?.[0];
    if (!address) {
      rejected.push(line);
      continue;
    }
    contacts.push({ email: address.toLowerCase(), values: completeValues({ ...raw, email: address }) });
  }
  return { contacts, rejected, columns: [...new Set(fields.filter((f): f is string => Boolean(f)))] };
}

// ---------------------------------------------------------------------------------------------
// Scheduling in the team's timezone (America/Chicago), without a date library.
// ---------------------------------------------------------------------------------------------

export const TEAM_TZ = "America/Chicago";

/** "2026-10-22" + "09:30" in the team's timezone -> the UTC instant, as ISO. */
export function teamLocalToUtc(date: string, time: string, timeZone = TEAM_TZ): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const asUtc = new Date(`${date}T${time}:00Z`);
  if (Number.isNaN(asUtc.getTime())) return null;
  // The offset at that wall-clock moment; correct across daylight saving changes for all but the
  // missing/repeated hour itself.
  const offset = (d: Date) => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(d);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    const local = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
    return local - d.getTime();
  };
  const guess = new Date(asUtc.getTime() - offset(asUtc));
  return new Date(asUtc.getTime() - offset(guess)).toISOString();
}

/** A UTC instant as the team's local date and time, for form fields. */
export function utcToTeamLocal(iso: string, timeZone = TEAM_TZ): { date: string; time: string } {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

/** "Thursday, October 22 at 9:30 AM" in the team's timezone. */
export function formatTeamTime(iso: string, timeZone = TEAM_TZ): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString("en-US", { timeZone, weekday: "long", month: "long", day: "numeric" });
  const time = d.toLocaleTimeString("en-US", { timeZone, hour: "numeric", minute: "2-digit" });
  return `${day} at ${time}`;
}

/** How long sending takes at a pace, in words: "about 12 minutes". */
export function sendDuration(count: number, perMinute: number): string {
  if (count <= 0) return "no time";
  const minutes = Math.ceil(count / Math.max(1, perMinute));
  if (minutes <= 1) return "about a minute";
  if (minutes < 60) return `about ${minutes} minutes`;
  const hours = Math.round((minutes / 60) * 10) / 10;
  return `about ${hours} hour${hours === 1 ? "" : "s"}`;
}
