"""One definition of every pipeline number, so the agents, the brief and the board can't disagree.

Prospects are leads the lead-gen pipeline found (source = 'lead-gen'). Website inquiries and test
leads are not outreach results. A reply is an inbound message from a prospect that isn't an
auto-reply (same rule as crm/src/lib/email/deliverability.ts isAutoReply).

usable = the site was actually read AND an email was found AND score >= USABLE_MIN_SCORE. This rule
reproduces Max's own picks on the 2026-10-17 run (31/32 contacted, 1/13 lost).

Call-list leads (signals.call_list: no site or an unreadable one, kept unscored for phone outreach)
are a separate channel, so they sit outside the usable-rate denominator.
"""

from __future__ import annotations

import re
from typing import Any

from leadgen.store import Store

USABLE_MIN_SCORE = 55
USABLE_TARGET = 0.70
PROSPECT_SOURCE = "lead-gen"
_AUTO_REPLY = re.compile(r"^\s*(automatic reply|auto(matic)?[- ]?reply|autoreply|auto:|out of (the )?office)", re.I)
_PAGE = 1000


def is_auto_reply(subject: str | None) -> bool:
    return bool(_AUTO_REPLY.match(subject or ""))


def site_read(lead: dict[str, Any]) -> bool:
    signals = lead.get("signals") or {}
    return bool(signals.get("pages_crawled")) and not signals.get("crawl_error")


def is_usable(lead: dict[str, Any]) -> bool:
    return site_read(lead) and bool((lead.get("email") or "").strip()) and (lead.get("score") or 0) >= USABLE_MIN_SCORE


def call_list(lead: dict[str, Any]) -> bool:
    return bool((lead.get("signals") or {}).get("call_list"))


def usable_rate(leads: list[dict[str, Any]]) -> float:
    pool = [x for x in leads if not call_list(x)]
    return sum(is_usable(x) for x in pool) / len(pool) if pool else 0.0


def _all(store: Store, table: str, params: dict[str, str], order: str = "id") -> list[dict[str, Any]]:
    """Every matching row, a page at a time. Paging needs a stable order or rows repeat and go
    missing between pages, so it sorts on a unique column: `id`, or the table's own key."""
    rows: list[dict[str, Any]] = []
    while True:
        page = store._req("GET", table, params={
            **params, "order": order, "limit": str(_PAGE), "offset": str(len(rows)),
        }).json()
        rows.extend(page)
        if len(page) < _PAGE:
            return rows


def prospects(store: Store, run_id: str | None = None) -> list[dict[str, Any]]:
    params = {
        "select": "id,business_name,email,phone,score,signals,segment,status,run_id,created_at",
        "source": f"eq.{PROSPECT_SOURCE}",
    }
    if run_id:
        params["run_id"] = f"eq.{run_id}"
    return _all(store, "leads", params)


def snapshot(store: Store, since: str | None = None) -> dict[str, Any]:
    """Pipeline counts. `since` (ISO timestamp) limits event counts to that window; totals otherwise."""
    leads = prospects(store)
    ids = {x["id"] for x in leads}
    window = {"created_at": f"gte.{since}"} if since else {}
    runs = _all(store, "lead_gen_runs", {"select": "found,kept,status", "status": "eq.completed"})
    msgs = _all(store, "email_messages", {"select": "lead_id,direction,status,subject", **window})
    sent = [m for m in msgs if m["direction"] == "out" and m["status"] == "sent" and m["lead_id"] in ids]
    replies = [m for m in msgs if m["direction"] == "in" and m["lead_id"] in ids and not is_auto_reply(m["subject"])]
    meetings = _all(store, "calendar_events", {"select": "lead_id", "lead_id": "not.is.null", **window})
    pending = _all(store, "email_drafts", {"select": "id", "status": "eq.pending"})
    return {
        "scanned": sum(r.get("found") or 0 for r in runs),
        "kept": len(leads),
        "usable": sum(is_usable(x) for x in leads),
        "usable_rate": round(usable_rate(leads), 3),
        "call_list": sum(call_list(x) for x in leads),
        "drafts_pending": len(pending),
        "sent": len(sent),
        "contacted": len({m["lead_id"] for m in sent}),
        "replies": len(replies),
        "replied_leads": len({m["lead_id"] for m in replies}),
        "meetings": len([m for m in meetings if m["lead_id"] in ids]),
        "won": sum(x["status"] == "converted" for x in leads),
        "since": since,
    }
