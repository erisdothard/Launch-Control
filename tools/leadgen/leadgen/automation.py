"""The CRM's hands: the work nobody should have to click through, every few minutes.

1. Meetings. Read the shared Outlook calendar and attach any event whose attendees include a
   lead's email to that lead (calendar_events). The database trigger then moves the lead to
   "meeting" and sets "send the proposal" for the day after.
2. Reply drafts. When a lead's last message is theirs, write a reply for a person to review in the
   CRM Inbox's Drafts. Nothing is sent from here. Mail from people who aren't leads (the Inbox
   stores the whole mailbox) is never drafted for: every read here starts from a lead.
3. Follow-ups. When a lead we emailed hasn't answered and its follow-up date has come, write the
   next short nudge into Drafts (the CRM sends it on its own when automatic sending is on), up to
   the configured number of nudges, then asks the CRM to send what's due. A lead still silent after
   the last one is closed as gone cold.

Statuses themselves are never set here except "went cold": the triggers in
crm/supabase/migrations/20261019000005_auto_pipeline.sql own every other move.
"""

from __future__ import annotations

import logging
import os
import threading
import time
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from typing import Any, Protocol
from zoneinfo import ZoneInfo

import anthropic
import httpx

from leadgen import outlook_sync
from leadgen.store import Store

log = logging.getLogger(__name__)

RUN_EVERY_S = 300
MODEL = "claude-sonnet-5-5"
TEAM_TZ = ZoneInfo("America/Chicago")
# Calendar window read each pass: a week back (meetings logged late) to two months out.
CALENDAR_BACK = timedelta(days=7)
CALENDAR_AHEAD = timedelta(days=60)
# Messages of history given to the writer, newest last.
THREAD_DEPTH = 12
MAX_DRAFTS_PER_PASS = 20

COMPANY = (
    "Launch Control builds the commercial system behind a business (brand, website, CRM, lead "
    "generation, outreach and automation) and then helps run it."
)


@dataclass(frozen=True)
class Settings:
    draft_replies: bool
    max_follow_ups: int
    cold_after_days: int


class Writer(Protocol):
    def write(self, system: str, prompt: str) -> str: ...


class ClaudeWriter:
    def __init__(self, client: anthropic.Anthropic | None = None, model: str = MODEL) -> None:
        self.client = client or anthropic.Anthropic(max_retries=3)
        self.model = model

    def write(self, system: str, prompt: str) -> str:
        msg = self.client.messages.create(
            model=self.model, max_tokens=4000, system=system, messages=[{"role": "user", "content": prompt}],
        )
        text = "".join(b.text for b in msg.content if getattr(b, "type", "") == "text").strip()
        # The model can think before it writes; an empty answer is skipped and retried next pass.
        if not text:
            log.warning("writer returned no text (stop_reason=%s)", msg.stop_reason)
        return text


def team_today(now: datetime | None = None) -> date:
    return (now or datetime.now(UTC)).astimezone(TEAM_TZ).date()


def re_subject(subject: str) -> str:
    s = (subject or "").strip()
    return s if s.lower().startswith("re:") else f"Re: {s}" if s else "Following up"


def first_address(addresses: str | None) -> str:
    """The first of a stored "a@x.com, b@y.com" recipient list (the Inbox stores every To)."""
    return (addresses or "").split(",")[0].strip()


def first_name(contact: str | None) -> str:
    return (contact or "").strip().split(" ")[0]


# --- reading -------------------------------------------------------------------------------------

def load_settings(store: Store) -> Settings:
    rows = store._req("GET", "automation_settings", params={"id": "eq.true", "select": "*"}).json()
    row = rows[0] if rows else {}
    return Settings(
        draft_replies=bool(row.get("draft_replies", True)),
        max_follow_ups=len(row.get("follow_up_days") or [3, 4, 7]),
        cold_after_days=int(row.get("cold_after_days", 7)),
    )


def thread(store: Store, lead_id: str) -> list[dict[str, Any]]:
    """A lead's recent mail. Scoped by lead_id, so Inbox mail with no lead never reaches a draft."""
    rows = store._req("GET", "email_messages", params={
        "lead_id": f"eq.{lead_id}", "or": "(direction.eq.in,status.eq.sent)",
        "select": "id,direction,from_address,to_address,subject,body_text,created_at,account_id",
        "order": "created_at.desc", "limit": str(THREAD_DEPTH),
    }).json()
    return list(reversed(rows))


def sender_names(store: Store) -> dict[str, str]:
    rows = store._req("GET", "email_accounts", params={"select": "id,display_name"}).json()
    return {r["id"]: r.get("display_name") or "" for r in rows}


def pending_draft_leads(store: Store, kind: str | None = None) -> set[str]:
    params = {"status": "eq.pending", "select": "lead_id"}
    if kind:
        params["kind"] = f"eq.{kind}"
    return {r["lead_id"] for r in store._req("GET", "email_drafts", params=params).json()}


def drafted_messages(store: Store, message_ids: list[str]) -> set[str]:
    if not message_ids:
        return set()
    rows = store._req("GET", "email_drafts", params={
        "reply_to_message_id": f"in.({','.join(message_ids)})", "select": "reply_to_message_id",
    }).json()
    return {r["reply_to_message_id"] for r in rows}


# --- writing -------------------------------------------------------------------------------------

def _transcript(messages: list[dict[str, Any]], lead: dict[str, Any]) -> str:
    who = lead.get("contact_name") or lead.get("business_name") or "them"
    parts = []
    for m in messages:
        side = "THEM" if m["direction"] == "in" else "US"
        stamp = m["created_at"][:10]
        tag = f"{side} · {stamp}" + (f" · {who}" if side == "THEM" else "")
        parts.append(f"[{tag}]\nSubject: {m['subject']}\n{m['body_text'].strip()}")
    return "\n\n".join(parts)


def _lead_brief(lead: dict[str, Any]) -> str:
    facts = [f"Business: {lead.get('business_name')}"]
    for key, label in (("contact_name", "Contact"), ("contact_title", "Title"), ("segment", "Industry"),
                       ("city", "City"), ("outreach_hook", "Why we reached out")):
        if lead.get(key):
            facts.append(f"{label}: {lead[key]}")
    return "\n".join(facts)


SYSTEM = (
    f"You write emails for a small business-development team. {COMPANY} "
    "Write like a sharp, friendly person, not a marketer: short sentences, plain words, no buzzwords, "
    "no exclamation marks, no emoji, no subject line, no sign-off or signature (it is added later). "
    "Start with a one-word greeting and the person's first name when you have it. Never invent facts, "
    "prices, dates or availability that are not in the conversation; if something needs a person's "
    "decision, say you'll confirm it. Output only the email body."
)


def write_reply(writer: Writer, lead: dict[str, Any], messages: list[dict[str, Any]], sender: str) -> str:
    prompt = (
        f"Draft our reply to their latest message. Sender: {sender or 'the team'}.\n\n"
        f"{_lead_brief(lead)}\n\nConversation so far:\n\n{_transcript(messages, lead)}\n\n"
        "Answer what they asked or said directly. If they show interest, propose a short call and ask "
        "what time works this week. Under 120 words."
    )
    return writer.write(SYSTEM, prompt)


def write_follow_up(writer: Writer, lead: dict[str, Any], messages: list[dict[str, Any]], number: int, last: bool) -> str:
    tone = (
        "This is the last follow-up: say you'll close the loop for now and leave the door open."
        if last else "Add one new, specific reason it's worth a reply; don't repeat the first email."
    )
    prompt = (
        f"They haven't answered. Write follow-up number {number} as a reply on the same thread.\n\n"
        f"{_lead_brief(lead)}\n\nConversation so far:\n\n{_transcript(messages, lead)}\n\n"
        f"{tone} End with: \"If it's not a fit, just say so and I won't follow up again.\" Under 70 words."
    )
    return writer.write(SYSTEM, prompt)


def insert_draft(store: Store, row: dict[str, Any]) -> bool:
    """Insert one draft; the unique indexes make a repeat a no-op. True when stored."""
    resp = store._req("POST", "email_drafts", prefer="resolution=ignore-duplicates,return=representation", json=row)
    return bool(resp.json())


# --- passes --------------------------------------------------------------------------------------

def draft_replies(store: Store, writer: Writer, limit: int = MAX_DRAFTS_PER_PASS) -> int:
    leads = store._req("GET", "leads", params={
        "awaiting": "eq.us", "do_not_contact": "eq.false", "status": "not.in.(converted)",
        "select": "id,business_name,email,contact_name,contact_title,segment,city,outreach_hook",
        "order": "last_reply_at.asc.nullslast", "limit": "200",
    }).json()
    names = sender_names(store)
    pending = pending_draft_leads(store, "reply")
    candidates: list[tuple[dict[str, Any], list[dict[str, Any]]]] = []
    for lead in leads:
        if lead["id"] in pending:
            continue
        msgs = thread(store, lead["id"])
        if msgs and msgs[-1]["direction"] == "in":
            candidates.append((lead, msgs))
    done = drafted_messages(store, [m[-1]["id"] for _, m in candidates])
    made = 0
    for lead, msgs in candidates:
        if made >= limit:
            break
        last_in = msgs[-1]
        if last_in["id"] in done:
            continue
        last_out = next((m for m in reversed(msgs) if m["direction"] == "out"), None)
        sender = names.get(last_out["account_id"], "") if last_out and last_out.get("account_id") else ""
        try:
            body = write_reply(writer, lead, msgs, sender)
        except Exception:
            log.exception("reply draft failed for lead %s", lead["id"])
            continue
        if body and insert_draft(store, {
            "lead_id": lead["id"], "kind": "reply", "reply_to_message_id": last_in["id"],
            "to_address": last_in["from_address"] or lead["email"], "subject": re_subject(last_in["subject"]),
            "body_text": body,
        }):
            made += 1
    return made


def queue_follow_ups(store: Store, writer: Writer, settings: Settings, today: date,
                     limit: int = MAX_DRAFTS_PER_PASS) -> int:
    leads = store._req("GET", "leads", params={
        "awaiting": "eq.them", "do_not_contact": "eq.false", "status": "in.(contacted,replied)",
        "follow_up_on": f"lte.{today.isoformat()}", "follow_up_count": f"lt.{settings.max_follow_ups}",
        "email": "neq.", "select": "id,business_name,email,contact_name,contact_title,segment,city,outreach_hook,follow_up_count",
        "order": "follow_up_on.asc", "limit": "200",
    }).json()
    pending = pending_draft_leads(store)
    made = 0
    for lead in leads:
        if made >= limit:
            break
        if lead["id"] in pending:
            continue
        msgs = thread(store, lead["id"])
        last_out = next((m for m in reversed(msgs) if m["direction"] == "out"), None)
        if not msgs or msgs[-1]["direction"] != "out" or last_out is None:
            continue
        number = int(lead.get("follow_up_count") or 0) + 1
        try:
            body = write_follow_up(writer, lead, msgs, number, last=number >= settings.max_follow_ups)
        except Exception:
            log.exception("follow-up draft failed for lead %s", lead["id"])
            continue
        if not body:
            continue
        stored = insert_draft(store, {
            "lead_id": lead["id"], "kind": "follow_up", "follow_up_number": number,
            "to_address": first_address(last_out["to_address"]) or lead["email"], "subject": re_subject(last_out["subject"]),
            "body_text": body,
        })
        if stored:
            # Counted when written, so an unsent draft never spawns a second nudge behind it.
            store.patch_lead(lead["id"], {"follow_up_count": number, "next_action": f"Follow-up {number} ready in Drafts"})
            made += 1
    return made


def close_gone_cold(store: Store, settings: Settings, now: datetime) -> int:
    cutoff = (now - timedelta(days=settings.cold_after_days)).isoformat()
    leads = store._req("GET", "leads", params={
        "awaiting": "eq.them", "status": "in.(contacted,replied)", "follow_up_count": f"gte.{settings.max_follow_ups}",
        "last_contacted_at": f"lt.{cutoff}", "select": "id",
    }).json()
    pending = pending_draft_leads(store)
    closed = 0
    for lead in leads:
        if lead["id"] in pending:
            continue
        store.patch_lead(lead["id"], {
            "status": "lost", "status_reason": "Went cold: no reply to any follow-up",
            "awaiting": None, "follow_up_on": None, "next_action": "",
        })
        closed += 1
    return closed


def _graph_time(value: dict[str, Any] | None) -> str | None:
    """Graph dateTime (UTC when asked for UTC, no offset, 7-digit fraction) to ISO with Z."""
    raw = (value or {}).get("dateTime")
    if not raw:
        return None
    return datetime.fromisoformat(raw[:26]).replace(tzinfo=UTC).isoformat()


def sync_meetings(store: Store, graph: outlook_sync.GraphClient, now: datetime) -> int:
    """Attach Outlook events with a lead on the invite. Returns how many new events were stored."""
    own = store.own_addresses()
    stored = 0
    for account in store.outlook_accounts():
        token = outlook_sync.access_token(store, graph, account, scope="Calendars.ReadWrite")
        if not token:
            continue
        headers = {"Authorization": f"Bearer {token}", "Prefer": 'outlook.timezone="UTC"'}
        url: str | None = (
            f"{outlook_sync.me()}/calendarView?startDateTime={(now - CALENDAR_BACK).strftime('%Y-%m-%dT%H:%M:%SZ')}"
            f"&endDateTime={(now + CALENDAR_AHEAD).strftime('%Y-%m-%dT%H:%M:%SZ')}"
            "&$select=id,subject,start,end,isAllDay,isCancelled,attendees,location&$top=100"
        )
        events: list[dict[str, Any]] = []
        while url:
            resp = graph.http.get(url, headers=headers)
            resp.raise_for_status()
            body = resp.json()
            events.extend(body.get("value", []))
            url = body.get("@odata.nextLink")
        live = [e for e in events if not e.get("isCancelled")]
        emails = {(a.get("emailAddress") or {}).get("address", "").lower() for e in live for a in e.get("attendees") or []}
        by_email = store.leads_by_emails(sorted(x for x in emails if x and x not in own))
        if not by_email:
            continue
        ids = [e["id"] for e in live]
        known: set[str] = set()
        for i in range(0, len(ids), 50):
            chunk = ",".join(f'"{x}"' for x in ids[i : i + 50])
            rows = store._req("GET", "calendar_events", params={
                "outlook_event_id": f"in.({chunk})", "select": "outlook_event_id",
            }).json()
            known.update(r["outlook_event_id"] for r in rows)
        for e in live:
            if e["id"] in known:
                continue
            lead_id = next((by_email[a] for a in ((x.get("emailAddress") or {}).get("address", "").lower()
                                                  for x in e.get("attendees") or []) if a in by_email), None)
            starts, ends = _graph_time(e.get("start")), _graph_time(e.get("end"))
            if not lead_id or not starts or not ends:
                continue
            store._req("POST", "calendar_events", prefer="return=minimal", json={
                "title": (e.get("subject") or "Meeting")[:200], "starts_at": starts, "ends_at": ends,
                "all_day": bool(e.get("isAllDay")), "location": ((e.get("location") or {}).get("displayName") or "")[:200],
                "lead_id": lead_id, "created_by": "outlook", "outlook_event_id": e["id"],
            })
            stored += 1
    return stored


def send_due_follow_ups(http: httpx.Client | None = None) -> int:
    """Ask the CRM to send the queued follow-ups (it owns sending, signatures and the daily cap,
    and does nothing while automatic sending is off). Needs CRM_URL and AUTOMATION_SECRET."""
    secret = os.environ.get("AUTOMATION_SECRET", "").strip()
    if not secret:
        return 0
    base = os.environ.get("CRM_URL", "https://crm.golaunchcontrol.com").rstrip("/")
    client = http or httpx.Client(timeout=120)
    resp = client.post(f"{base}/api/automation/send-follow-ups", headers={"Authorization": f"Bearer {secret}"})
    resp.raise_for_status()
    return int(resp.json().get("sent", 0))


def run_once(store: Store, writer: Writer, graph: outlook_sync.GraphClient | None, now: datetime | None = None) -> dict[str, int]:
    now = now or datetime.now(UTC)
    settings = load_settings(store)
    out = {"meetings": 0, "replies": 0, "follow_ups": 0, "sent": 0, "cold": 0}
    steps = (
        ("meetings", lambda: sync_meetings(store, graph, now) if graph else 0),
        ("replies", lambda: draft_replies(store, writer) if settings.draft_replies else 0),
        ("follow_ups", lambda: queue_follow_ups(store, writer, settings, team_today(now))),
        ("sent", send_due_follow_ups),
        ("cold", lambda: close_gone_cold(store, settings, now)),
    )
    # Each step stands alone: a calendar outage must not stop the drafts.
    for name, step in steps:
        try:
            out[name] = step()
        except Exception:
            log.exception("automation step %s failed", name)
    return out


def start_background(store_factory, every_s: float = RUN_EVERY_S) -> threading.Thread:  # noqa: ANN001
    store, writer = store_factory(), ClaudeWriter()
    creds = outlook_sync.ms_credentials()
    graph = outlook_sync.GraphClient(*creds) if creds else None

    def loop() -> None:
        while True:
            counts = run_once(store, writer, graph)
            if any(counts.values()):
                log.info("automation: %s", counts)
            time.sleep(every_s)

    thread_ = threading.Thread(target=loop, name="crm-automation", daemon=True)
    thread_.start()
    log.info("crm automation on, every %.0fs", every_s)
    return thread_
