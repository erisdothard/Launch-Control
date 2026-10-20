"""Supabase (PostgREST) persistence with the service-role key. Never touches status/notes of
existing rows: a human may have moved a lead along the pipeline.
"""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime
from typing import Any

import httpx

log = logging.getLogger(__name__)

LEAD_SOURCE = "lead-gen"
# Fields the pipeline owns and refreshes on every run.
PROSPECT_FIELDS = (
    "segment", "city", "state", "website", "score", "score_breakdown", "score_reason",
    "outreach_hook", "signals", "run_id", "scored_at",
)
# Contact fields a human may correct in the CRM: only filled when currently empty.
FILL_IF_EMPTY = ("email", "phone", "contact_name", "contact_title")
_CHUNK = 80


class StoreError(RuntimeError):
    pass


def insert_payload(row: dict[str, Any], run_id: str | None) -> dict[str, Any]:
    payload = {k: v for k, v in row.items()}
    payload.update({"source": LEAD_SOURCE, "status": "new", "run_id": run_id})
    payload["email"] = payload.get("email") or ""
    payload["phone"] = payload.get("phone") or ""
    return payload


def update_payload(row: dict[str, Any], existing: dict[str, Any], run_id: str | None) -> dict[str, Any]:
    patch = {k: row.get(k) for k in PROSPECT_FIELDS if k != "run_id"}
    patch["run_id"] = run_id
    for k in FILL_IF_EMPTY:
        if not existing.get(k) and row.get(k):
            patch[k] = row[k]
    return patch


class Store:
    def __init__(self, url: str, key: str, client: httpx.Client | None = None) -> None:
        self.base = f"{url.rstrip('/')}/rest/v1"
        self.client = client or httpx.Client(timeout=30)
        self.headers = {
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        }

    def _req(self, method: str, path: str, *, prefer: str | None = None, **kw: Any) -> httpx.Response:
        headers = dict(self.headers)
        if prefer:
            headers["Prefer"] = prefer
        try:
            resp = self.client.request(method, f"{self.base}/{path}", headers=headers, **kw)
        except httpx.HTTPError as exc:
            raise StoreError(f"Supabase {method} {path.split('?')[0]} failed: {type(exc).__name__}") from exc
        if resp.status_code >= 400:
            raise StoreError(f"Supabase {method} {path.split('?')[0]} -> {resp.status_code}: {resp.text[:300]}")
        return resp

    def existing(self, column: str, values: list[str]) -> dict[str, dict[str, Any]]:
        """Rows (keyed by `column`) whose column value is in `values`."""
        out: dict[str, dict[str, Any]] = {}
        uniq = sorted({v for v in values if v})
        for i in range(0, len(uniq), _CHUNK):
            chunk = uniq[i : i + _CHUNK]
            quoted = ",".join('"' + v.replace('"', "") + '"' for v in chunk)
            resp = self._req(
                "GET", "leads",
                params={"select": "id,domain,phone,email,contact_name,contact_title", column: f"in.({quoted})"},
            )
            for r in resp.json():
                out[str(r[column])] = r
        return out

    def known_domains(self, domains: list[str]) -> set[str]:
        return set(self.existing("domain", domains))

    def start_run(self, config_snapshot: dict[str, Any]) -> str:
        resp = self._req("POST", "lead_gen_runs", prefer="return=representation",
                         json={"status": "running", "config": config_snapshot})
        return str(resp.json()[0]["id"])

    def claim_run(self) -> dict[str, Any] | None:
        """Atomically move the oldest queued run to running (claim_lead_gen_run RPC)."""
        rows = self._req("POST", "rpc/claim_lead_gen_run", json={}).json()
        return rows[0] if rows else None

    def set_stage(self, run_id: str, stage: str) -> None:
        self._req("PATCH", "lead_gen_runs", params={"id": f"eq.{run_id}"}, prefer="return=minimal",
                  json={"stage": stage})

    def run_status(self, run_id: str) -> str | None:
        rows = self._req("GET", "lead_gen_runs", params={"id": f"eq.{run_id}", "select": "status"}).json()
        return rows[0]["status"] if rows else None

    def fail_orphaned_runs(self) -> int:
        """A worker restart leaves its run 'running' forever; nothing else can be running then."""
        rows = self._req("PATCH", "lead_gen_runs", params={"status": "eq.running"}, prefer="return=representation",
                         json={"status": "failed", "finished_at": datetime.now(UTC).isoformat(),
                               "error": "worker restarted mid-run"}).json()
        return len(rows)

    # --- email (Gmail reply sync) ---

    def gmail_accounts(self) -> list[dict[str, Any]]:
        return self._req("GET", "email_accounts", params={
            "provider": "eq.gmail", "status": "eq.active", "select": "id,address,gmail_history_id",
        }).json()

    def gmail_refresh_token(self, account_id: str) -> str | None:
        token = self._req("POST", "rpc/gmail_refresh_token", json={"p_account_id": account_id}).json()
        return token or None

    def set_history_id(self, account_id: str, history_id: str) -> None:
        self._req("PATCH", "email_accounts", params={"id": f"eq.{account_id}"}, prefer="return=minimal",
                  json={"gmail_history_id": history_id})

    def set_account_status(self, account_id: str, status: str) -> None:
        self._req("PATCH", "email_accounts", params={"id": f"eq.{account_id}"}, prefer="return=minimal",
                  json={"status": status})

    def leads_for_threads(self, thread_ids: list[str]) -> dict[str, str]:
        out: dict[str, str] = {}
        for i in range(0, len(thread_ids), _CHUNK):
            chunk = ",".join(f'"{t}"' for t in thread_ids[i : i + _CHUNK])
            if not chunk:
                continue
            rows = self._req("GET", "email_messages", params={
                "provider_thread_id": f"in.({chunk})", "select": "lead_id,provider_thread_id",
            }).json()
            out.update({r["provider_thread_id"]: r["lead_id"] for r in rows})
        return out

    def outlook_accounts(self) -> list[dict[str, Any]]:
        """Connected Outlook mailboxes (alias rows share the mailbox's token and inbox, so skip them)."""
        return self._req("GET", "email_accounts", params={
            "provider": "eq.outlook", "status": "eq.active", "mailbox": "is.null", "select": "id,address,sync_cursor",
        }).json()

    def own_addresses(self) -> set[str]:
        rows = self._req("GET", "email_accounts", params={"select": "address"}).json()
        return {r["address"].lower() for r in rows}

    def mail_refresh_token(self, account_id: str) -> str | None:
        token = self._req("POST", "rpc/mail_refresh_token", json={"p_account_id": account_id}).json()
        return token or None

    def save_refresh_token(self, account_id: str, token: str) -> None:
        self._req("POST", "rpc/save_mail_refresh_token", json={"p_account_id": account_id, "p_refresh_token": token})

    def set_sync_cursor(self, account_id: str, cursor: str) -> None:
        self._req("PATCH", "email_accounts", params={"id": f"eq.{account_id}"}, prefer="return=minimal",
                  json={"sync_cursor": cursor})

    def mark_mailbox_reconnect(self, account_id: str) -> None:
        """Flag the mailbox and every alias row sharing its token."""
        row = self._req("GET", "email_accounts", params={"id": f"eq.{account_id}", "select": "token_secret_id"}).json()
        secret = row[0]["token_secret_id"] if row else None
        params = {"token_secret_id": f"eq.{secret}"} if secret else {"id": f"eq.{account_id}"}
        self._req("PATCH", "email_accounts", params=params, prefer="return=minimal", json={"status": "needs_reconnect"})

    def leads_by_emails(self, emails: list[str]) -> dict[str, str]:
        """Lowercased lead email -> lead id, for the given addresses."""
        out: dict[str, str] = {}
        wanted = sorted({e.lower() for e in emails if e})
        for i in range(0, len(wanted), _CHUNK):
            chunk = ",".join(f'"{e}"' for e in wanted[i : i + _CHUNK])
            rows = self._req("GET", "leads", params={"email": f"in.({chunk})", "select": "id,email"}).json()
            out.update({r["email"].lower(): r["id"] for r in rows})
        return out

    def known_message_ids(self, headers: list[str]) -> set[str]:
        """RFC Message-IDs already stored (the CRM's own sends show up again in Sent Items)."""
        out: set[str] = set()
        wanted = sorted({h for h in headers if h})
        for i in range(0, len(wanted), _CHUNK):
            chunk = ",".join(json.dumps(h) for h in wanted[i : i + _CHUNK])
            rows = self._req("GET", "email_messages", params={
                "message_id_header": f"in.({chunk})", "select": "message_id_header",
            }).json()
            out.update(r["message_id_header"] for r in rows)
        return out

    def attach_provider_ids(self, message_id_header: str, provider_message_id: str, provider_thread_id: str | None) -> None:
        """A CRM send that went out over SMTP has only its Message-ID; add the ids Outlook gave it."""
        self._req("PATCH", "email_messages", params={
            "message_id_header": f"eq.{message_id_header}", "provider_message_id": "is.null",
        }, prefer="return=minimal", json={"provider_message_id": provider_message_id, "provider_thread_id": provider_thread_id})

    def insert_message(self, row: dict[str, Any]) -> int:
        """Insert unless (provider, provider_message_id) exists. Returns 1 if stored."""
        resp = self._req("POST", "email_messages", params={"on_conflict": "provider,provider_message_id"},
                         prefer="resolution=ignore-duplicates,return=representation", json=row)
        return len(resp.json())

    def finish_run(self, run_id: str, status: str, counts: dict[str, int], error: str | None = None) -> None:
        body = {"status": status, "stage": None, "finished_at": datetime.now(UTC).isoformat(), "error": error,
                **{k: counts.get(k, 0) for k in ("found", "enriched", "kept", "excluded")}}
        self._req("PATCH", "lead_gen_runs", params={"id": f"eq.{run_id}"}, prefer="return=minimal", json=body)

    def upsert_leads(self, rows: list[dict[str, Any]], run_id: str | None) -> dict[str, int]:
        """Insert new prospects; refresh prospect fields on ones already in the CRM."""
        by_domain = self.existing("domain", [r["domain"] for r in rows if r.get("domain")])
        by_phone = self.existing("phone", [r["phone"] for r in rows if not r.get("domain") and r.get("phone")])
        inserts: list[dict[str, Any]] = []
        counts = {"inserted": 0, "updated": 0, "skipped": 0}
        for row in rows:
            match = by_domain.get(row.get("domain") or "") or (
                by_phone.get(row.get("phone") or "") if not row.get("domain") else None
            )
            if match:
                self._req("PATCH", "leads", params={"id": f"eq.{match['id']}"}, prefer="return=minimal",
                          json=update_payload(row, match, run_id))
                counts["updated"] += 1
            else:
                inserts.append(insert_payload(row, run_id))
        for i in range(0, len(inserts), _CHUNK):
            chunk = inserts[i : i + _CHUNK]
            # ignore-duplicates guards a race with a concurrent run inserting the same domain.
            self._req("POST", "leads", params={"on_conflict": "domain"},
                      prefer="return=minimal,resolution=ignore-duplicates", json=chunk)
            counts["inserted"] += len(chunk)
        return counts

    def fetch_leads(self, min_score: int | None = None, limit: int = 5000) -> list[dict[str, Any]]:
        params: dict[str, Any] = {"select": "*", "source": f"eq.{LEAD_SOURCE}",
                                  "order": "score.desc.nullslast", "limit": str(limit)}
        if min_score is not None:
            params["score"] = f"gte.{min_score}"
        return list(self._req("GET", "leads", params=params).json())

    def lead_gen_rows(self) -> list[dict[str, Any]]:
        return self.fetch_leads()

    def patch_lead(self, lead_id: str, patch: dict[str, Any]) -> None:
        self._req("PATCH", "leads", params={"id": f"eq.{lead_id}"}, json=patch)
