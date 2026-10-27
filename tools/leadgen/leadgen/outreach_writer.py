"""Outreach Writer: the first email to each usable prospect, written as a campaign draft.

One pass:
1. If an agent-made campaign draft is still waiting for a person, stop: drafts never pile up.
2. Pick prospects that are usable (metrics.is_usable), status 'new', never emailed, not
   do_not_contact, not on email_suppressions, and not on any live campaign. Best score first.
3. For each (up to MAX_PER_PASS), Claude writes a subject and body that open on one fact we
   actually observed on that business (score evidence, site signals, the outreach hook).
   A regex check rejects time/speed words, generic openers, the dead demo link and overlong
   copy; a rejected draft is rewritten once, then skipped.
4. The batch is ONE email_campaigns row (status 'draft') plus campaign_recipients rows with the
   personal subject/body as overrides. Nothing is scheduled or sent: a person reviews and
   approves it in the CRM's Campaigns screen. The CRM adds the signature.

Every pass writes one agent_runs row (agent 'outreach-writer').
"""

from __future__ import annotations

import json
import logging
import os
import re
from collections import Counter
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any, Protocol
from zoneinfo import ZoneInfo

import anthropic

from leadgen import agent_log, metrics
from leadgen.store import Store

log = logging.getLogger(__name__)

AGENT = "outreach-writer"
CREATED_BY = "agent:outreach-writer"
MODEL = "claude-sonnet-5-5"
MAX_PER_PASS = 10
MAX_WORDS = 90
MAX_FACTS = 8
TEAM_TZ = ZoneInfo("America/Chicago")
BOOKING_URL = "https://www.golaunchcontrol.com/#book"  # web/src/content/site.ts: section id "book"
_CHUNK = 80

COMPANY = (
    "Launch Control builds the commercial system behind a business (brand, website, CRM, lead "
    "generation, outreach and automation) and then helps run it."
)

# The campaign's shared message. Every recipient row carries its own override, so this only
# goes out if someone adds a recipient by hand in the composer without writing them one.
FALLBACK_SUBJECT = "An idea for {{company|your team}}"
FALLBACK_BODY = (
    "Hi {{first_name|there}},\n\n"
    "We build the commercial system behind businesses like yours (website, CRM, lead generation "
    "and outreach) and then help run it.\n\n"
    f"If that's worth a conversation, you can pick a slot here: {BOOKING_URL}"
)

# --- the copy rules, as code ---------------------------------------------------------------------

# No time or speed claims in any form (WHY.md rule 4, CONVENTIONS.md). Checked with the business
# name removed, so "FastLane Karting" can still be named.
TIME_WORDS = re.compile(
    r"\b(fast(er|est)?|quick(er|est|ly)?|speed(y|ier|ily)?\s+up|sped\s+up|speedier|hours?|hrs?|"
    r"minutes?|mins?|seconds?|overnight|instant(ly)?|in\s+no\s+time|save[sd]?\s+(you\s+)?time|"
    r"saving\s+time|time[- ]saving|time\s+saved|turnaround|same[- ]day|24/7|round[- ]the[- ]clock|"
    r"\d+\s*(days?|weeks?|months?)|(a|one|two|three|few)\s+(days?|weeks?)|asap|right\s+away)\b",
    re.I,
)
GENERIC_OPENERS = re.compile(
    r"(hope\s+(this|you|all)\b.{0,30}\b(finds?|well|doing)|reach(ing)?\s+out|i\s+wanted\s+to|"
    r"my\s+name\s+is|just\s+checking\s+in|allow\s+me\s+to\s+introduce|i\s+came\s+across)",
    re.I,
)
DEAD_LINK = re.compile(r"demo\.golaunchcontrol\.com", re.I)
MARKDOWN = re.compile(r"(\*\*|__|^\s*[-*#]\s|\[[^\]]+\]\()", re.M)
SIGN_OFF = re.compile(
    r"^\s*(best|thanks|thank you|cheers|regards|kind regards|best regards|sincerely|talk soon|"
    r"all the best|warmly|max|maxwell|eris|the launch control team|launch control)\b[\w ,.!-]{0,30}$",
    re.I,
)


def word_count(text: str) -> int:
    return len(re.findall(r"\S+", text))


def strip_sign_off(body: str) -> str:
    """The CRM adds the signature; drop any sign-off lines the model added anyway."""
    lines = body.strip().splitlines()
    while lines and (not lines[-1].strip() or SIGN_OFF.match(lines[-1])):
        lines.pop()
    return "\n".join(lines).strip()


def copy_problems(subject: str, body: str, business_name: str = "", fact_index: int | None = None,
                  n_facts: int = 0) -> list[str]:
    """Every rule the draft breaks, in words the model can act on. Empty = good to store."""
    name = re.escape(business_name.strip()) if business_name.strip() else None
    text = f"{subject}\n{body}"
    checked = re.sub(name, " ", text, flags=re.I) if name else text
    problems: list[str] = []
    hits = sorted({m.group(0).lower() for m in TIME_WORDS.finditer(checked)})
    if hits:
        problems.append(f"uses time or speed words ({', '.join(hits)}); remove every one")
    if GENERIC_OPENERS.search(text):
        problems.append("uses a generic opener (e.g. 'reaching out', 'hope this finds you well')")
    if DEAD_LINK.search(text):
        problems.append("links demo.golaunchcontrol.com, which does not exist")
    if "golaunchcontrol.com" not in body:
        problems.append(f"missing the booking link {BOOKING_URL}")
    if word_count(body) > MAX_WORDS:
        problems.append(f"body is {word_count(body)} words; the limit is {MAX_WORDS}")
    if MARKDOWN.search(body):
        problems.append("uses markdown or bullets; plain text only")
    if not subject.strip() or "\n" in subject.strip():
        problems.append("subject must be one short line")
    if fact_index is not None and not 1 <= fact_index <= n_facts:
        problems.append(f"fact_index {fact_index} is not one of the listed facts 1-{n_facts}")
    return problems


# --- facts we observed ---------------------------------------------------------------------------

def observed_facts(lead: dict[str, Any]) -> list[str]:
    """Concrete things we saw on this business, best first. Facts carrying a banned word are
    dropped so the model is never handed one (outreach_hook has contained 'faster')."""
    facts: list[str] = []
    breakdown = lead.get("score_breakdown") or {}
    rated = sorted(
        ((v.get("rating") or 0, (v.get("evidence") or "").strip()) for v in breakdown.values() if isinstance(v, dict)),
        key=lambda x: -x[0],
    )
    facts += [ev for rating, ev in rated if ev and rating >= 3][:4]
    s = lead.get("signals") or {}
    if s.get("booking_tech"):
        facts.append(f"Their site takes bookings through {', '.join(s['booking_tech'])}")
    elif s.get("phrases"):
        facts.append("Their site tells customers to: " + "; ".join(f'"{p}"' for p in s["phrases"][:3]))
    if s.get("crm_tech"):
        facts.append(f"Their site runs {', '.join(s['crm_tech'])}")
    if s.get("latest_event_date"):
        facts.append(f"Their site lists an event dated {s['latest_event_date']}")
    if s.get("review_count") and s.get("rating"):
        facts.append(f"{s['review_count']} Google reviews averaging {s['rating']}")
    if s.get("site_builder"):
        facts.append(f"Their website is built on {s['site_builder']}")
    hook = (lead.get("outreach_hook") or "").strip()
    if hook:
        facts.append(f"Our research note: {hook}")
    name = lead.get("business_name") or ""
    clean = [f for f in dict.fromkeys(facts) if not TIME_WORDS.search(re.sub(re.escape(name), " ", f, flags=re.I) if name else f)]
    return clean[:MAX_FACTS]


def first_name(lead: dict[str, Any]) -> str:
    return (lead.get("contact_name") or "").strip().split(" ")[0]


# --- the prompt ----------------------------------------------------------------------------------

SYSTEM = (
    f"You write first emails for a small business-development team. {COMPANY} "
    "You are writing to one small business we have never contacted. Write like a sharp, friendly "
    "person, not a marketer: short sentences, plain words, no buzzwords, no exclamation marks, no "
    "emoji, plain text only (no markdown, no bullets).\n"
    "Rules:\n"
    "1. If a first name is given, the body starts with \"Hi <first name>,\" on its own line. Otherwise no greeting.\n"
    "2. The first sentence states ONE fact from the numbered list of observed facts, in your own words, "
    "and why it caught our eye. Return that fact's number as fact_index. Use only the facts and business "
    "details given; never invent facts, numbers, prices, names, clients or results.\n"
    "3. Then one or two sentences on what we would build or run for them, tied to that fact.\n"
    f"4. End with one low-pressure ask and this booking link, written exactly: {BOOKING_URL}\n"
    f"5. The body is {MAX_WORDS} words or fewer.\n"
    "6. Never use generic openers: \"I hope this finds you well\", \"reaching out\", \"I wanted to\", "
    "\"My name is\", \"I came across\", \"just checking in\".\n"
    "7. Never mention time or speed in any form: no hours, minutes, days, weeks, \"faster\", \"quick\", "
    "\"overnight\", \"save time\", \"instantly\", response times or any other duration or speed claim.\n"
    "8. No sign-off, no name, no signature: it is added later.\n"
    "9. Subject: 2 to 6 plain words, specific to them, no time or speed words."
)

SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "subject": {"type": "string"},
        "body": {"type": "string"},
        "fact_index": {"type": "integer"},
    },
    "required": ["subject", "body", "fact_index"],
    "additionalProperties": False,
}


def lead_prompt(lead: dict[str, Any], facts: list[str]) -> str:
    lines = [f"Business: {lead.get('business_name') or 'unknown'}"]
    if first_name(lead):
        lines.append(f"First name: {first_name(lead)}")
    for key, label in (("contact_title", "Their title"), ("segment", "Industry"), ("city", "City"),
                       ("state", "State"), ("website", "Website")):
        if lead.get(key):
            lines.append(f"{label}: {lead[key]}")
    numbered = "\n".join(f"{i}. {f}" for i, f in enumerate(facts, 1))
    return "\n".join(lines) + f"\n\nObserved facts (open on exactly one):\n{numbered}\n\nWrite the subject and body."


# --- the model -----------------------------------------------------------------------------------

class DraftError(RuntimeError):
    pass


class Asker(Protocol):
    def ask(self, system: str, prompt: str, schema: dict[str, Any]) -> dict[str, Any]: ...


class ClaudeJSON:
    """One structured-output call (same client pattern as automation.py, output format as score.py)."""

    def __init__(self, client: anthropic.Anthropic | None = None, model: str = MODEL, max_tokens: int = 2000) -> None:
        self.client = client or anthropic.Anthropic(max_retries=3)
        self.model = model
        self.max_tokens = max_tokens

    def ask(self, system: str, prompt: str, schema: dict[str, Any]) -> dict[str, Any]:
        msg = self.client.messages.create(
            model=self.model, max_tokens=self.max_tokens,
            system=[{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
            messages=[{"role": "user", "content": prompt}],
            output_config={"effort": "medium", "format": {"type": "json_schema", "schema": schema}},
        )
        if msg.stop_reason in ("refusal", "max_tokens"):
            raise DraftError(f"model stopped: {msg.stop_reason}")
        text = next((b.text for b in msg.content if getattr(b, "type", "") == "text"), "")
        try:
            out = json.loads(text)
        except json.JSONDecodeError as exc:
            raise DraftError("model returned unparseable JSON") from exc
        if not isinstance(out, dict):
            raise DraftError("model returned a non-object")
        return out


@dataclass(frozen=True)
class Draft:
    lead: dict[str, Any]
    subject: str
    body: str
    fact: str


def write_draft(asker: Asker, lead: dict[str, Any], facts: list[str]) -> tuple[Draft | None, str]:
    """Draft, check, one rewrite on failure. Returns (draft, '') or (None, why it was skipped)."""
    prompt = lead_prompt(lead, facts)
    problems: list[str] = []
    for _attempt in range(2):
        ask_prompt = prompt if not problems else (
            f"{prompt}\n\nYour previous draft broke these rules: {'; '.join(problems)}. Rewrite it so it follows every rule."
        )
        out = asker.ask(SYSTEM, ask_prompt, SCHEMA)
        subject = " ".join(str(out.get("subject") or "").split())
        body = strip_sign_off(str(out.get("body") or ""))
        idx = out.get("fact_index")
        idx = idx if isinstance(idx, int) else 0
        problems = copy_problems(subject, body, lead.get("business_name") or "", idx, len(facts))
        if not problems:
            return Draft(lead=lead, subject=subject, body=body, fact=facts[idx - 1]), ""
    return None, "copy check failed twice: " + "; ".join(problems)


# --- reading -------------------------------------------------------------------------------------

def _chunks(values: list[str]) -> list[list[str]]:
    return [values[i : i + _CHUNK] for i in range(0, len(values), _CHUNK)]


def waiting_agent_drafts(store: Store) -> list[str]:
    rows = store._req("GET", "email_campaigns", params={
        "status": "eq.draft", "created_by": f"eq.{CREATED_BY}", "select": "id",
    }).json()
    return [r["id"] for r in rows]


def emailed_leads(store: Store, lead_ids: list[str]) -> set[str]:
    out: set[str] = set()
    for chunk in _chunks(lead_ids):
        rows = store._req("GET", "email_messages", params={
            "lead_id": f"in.({','.join(chunk)})", "direction": "eq.out", "select": "lead_id",
        }).json()
        out.update(r["lead_id"] for r in rows)
    return out


def leads_on_live_campaigns(store: Store, lead_ids: list[str]) -> set[str]:
    """Leads already on a campaign that isn't cancelled (in any recipient state but cancelled)."""
    out: set[str] = set()
    for chunk in _chunks(lead_ids):
        rows = store._req("GET", "campaign_recipients", params={
            "lead_id": f"in.({','.join(chunk)})", "select": "lead_id,status,email_campaigns(status)",
        }).json()
        for r in rows:
            campaign = (r.get("email_campaigns") or {}).get("status")
            if r.get("status") != "cancelled" and campaign != "cancelled":
                out.add(r["lead_id"])
    return out


def suppressed(store: Store, emails: list[str]) -> set[str]:
    out: set[str] = set()
    for chunk in _chunks(sorted({e.lower() for e in emails if e})):
        rows = store._req("GET", "email_suppressions", params={
            "email": f"in.({','.join(json.dumps(e) for e in chunk)})", "select": "email",
        }).json()
        out.update(r["email"].lower() for r in rows)
    return out


LEAD_FIELDS = ("id,business_name,email,contact_name,contact_title,segment,city,state,website,score,"
               "score_breakdown,score_reason,outreach_hook,signals,status,do_not_contact")


def lead_details(store: Store, lead_ids: list[str]) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for chunk in _chunks(lead_ids):
        rows = store._req("GET", "leads", params={
            "id": f"in.({','.join(chunk)})", "do_not_contact": "eq.false", "status": "eq.new", "select": LEAD_FIELDS,
        }).json()
        out.update({r["id"]: r for r in rows})
    return out


def sending_account(store: Store) -> str | None:
    """The CRM's default sender (crm/src/components/inbox/sender.ts defaultSenderId): Outlook
    addresses if any are connected, Max's maxwell@ first, else the first active, else the first."""
    rows = store._req("GET", "email_accounts", params={
        "status": "neq.disabled", "select": "id,address,provider,status,mailbox", "order": "created_at.asc",
    }).json()
    outlook = [r for r in rows if r.get("provider") == "outlook"]
    pool = outlook or rows
    max_ = next((r for r in pool if (r.get("address") or "").lower().startswith("maxwell@")), None)
    pick = max_ or next((r for r in pool if r.get("status") == "active"), None) or (pool[0] if pool else None)
    return pick["id"] if pick else None


@dataclass
class Candidates:
    leads: list[dict[str, Any]] = field(default_factory=list)
    skipped: Counter[str] = field(default_factory=Counter)


def find_candidates(store: Store) -> Candidates:
    """Usable, new, never emailed, contactable prospects, best score first."""
    out = Candidates()
    pool = [p for p in metrics.prospects(store) if p.get("status") == "new"]
    usable = [p for p in pool if metrics.is_usable(p)]
    out.skipped["not usable"] = len(pool) - len(usable)
    ids = [p["id"] for p in usable]
    emailed = emailed_leads(store, ids)
    live = leads_on_live_campaigns(store, ids)
    blocked = suppressed(store, [p.get("email") or "" for p in usable])
    keep: list[str] = []
    for p in usable:
        if p["id"] in emailed:
            out.skipped["already emailed"] += 1
        elif p["id"] in live:
            out.skipped["already on a campaign"] += 1
        elif (p.get("email") or "").strip().lower() in blocked:
            out.skipped["suppressed"] += 1
        else:
            keep.append(p["id"])
    details = lead_details(store, keep)
    out.skipped["do not contact"] = len(keep) - len(details)
    out.leads = sorted(details.values(), key=lambda x: -(x.get("score") or 0))
    out.skipped = Counter({k: v for k, v in out.skipped.items() if v})
    return out


# --- writing -------------------------------------------------------------------------------------

def _merge(lead: dict[str, Any]) -> dict[str, str]:
    values = {"first_name": first_name(lead), "full_name": lead.get("contact_name") or "",
              "company": lead.get("business_name") or "", "email": lead.get("email") or "",
              "city": lead.get("city") or "", "state": lead.get("state") or "",
              "website": lead.get("website") or "", "title": lead.get("contact_title") or ""}
    return {k: str(v) for k, v in values.items() if v}


def create_campaign(store: Store, account_id: str | None, drafts: list[Draft], today: str) -> str:
    """Draft campaign + recipients, like createCampaign in crm/src/lib/store/campaigns.ts:
    if the recipients fail to save, the campaign is removed."""
    resp = store._req("POST", "email_campaigns", prefer="return=representation", json={
        "name": f"Agent drafts · {today} · {len(drafts)} leads", "account_id": account_id,
        "subject": FALLBACK_SUBJECT, "body_text": FALLBACK_BODY, "status": "draft",
        "include_signature": True, "created_by": CREATED_BY,
    })
    campaign_id = str(resp.json()[0]["id"])
    rows = [{
        "campaign_id": campaign_id, "lead_id": d.lead["id"], "email": d.lead["email"].strip().lower(),
        "merge": _merge(d.lead), "subject_override": d.subject, "body_override": d.body,
        "status": "pending", "step": 1,
    } for d in drafts]
    try:
        store._req("POST", "campaign_recipients", prefer="return=minimal", json=rows)
    except Exception:
        store._req("DELETE", "email_campaigns", params={"id": f"eq.{campaign_id}"}, prefer="return=minimal")
        raise
    return campaign_id


def run_once(store: Store, asker: Asker | None = None, now: datetime | None = None,
             limit: int = MAX_PER_PASS) -> None:
    """One pass: draft first emails as a campaign draft for human approval. Never sends."""
    now = now or datetime.now(UTC)
    with agent_log.agent_run(store, AGENT) as run:
        if asker is None and not os.environ.get("ANTHROPIC_API_KEY", "").strip():
            run.status = "failed"
            run.decision = "ANTHROPIC_API_KEY is not set, so nothing was drafted."
            run.evidence = {"drafted": 0, "skipped": {"no ANTHROPIC_API_KEY": 1}}
            return
        waiting = waiting_agent_drafts(store)
        if waiting:
            run.decision = f"Waiting: {len(waiting)} agent draft campaign(s) still need approval, so no new batch."
            run.evidence = {"drafted": 0, "waiting_campaign_ids": waiting}
            return
        found = find_candidates(store)
        skipped: Counter[str] = Counter(found.skipped)
        if not found.leads:
            run.decision = "No prospects to write to: none are usable, new and uncontacted."
            run.evidence = {"drafted": 0, "skipped": dict(skipped)}
            return
        asker = asker or ClaudeJSON()
        drafts: list[Draft] = []
        lead_skips: dict[str, str] = {}
        seen_emails: set[str] = set()
        for lead in found.leads[: limit * 2]:
            if len(drafts) >= limit:
                break
            email = (lead.get("email") or "").strip().lower()
            if email in seen_emails:
                lead_skips[lead["id"]] = "same email as another lead in this batch"
                continue
            facts = observed_facts(lead)
            if not facts:
                lead_skips[lead["id"]] = "no observed fact to open with"
                continue
            try:
                draft, why = write_draft(asker, lead, facts)
            except (anthropic.APIError, DraftError) as exc:
                log.warning("draft failed for lead %s: %s", lead["id"], exc)
                lead_skips[lead["id"]] = f"model error: {type(exc).__name__}"
                continue
            if draft is None:
                lead_skips[lead["id"]] = why
                continue
            drafts.append(draft)
            seen_emails.add(email)
        skipped.update(why.split(":")[0] for why in lead_skips.values())
        evidence: dict[str, Any] = {
            "drafted": len(drafts), "lead_ids": [d.lead["id"] for d in drafts],
            "facts_used": {d.lead["id"]: d.fact for d in drafts},
            "skipped": dict(skipped), "lead_skips": lead_skips,
        }
        if not drafts:
            run.decision = f"No drafts passed the copy check ({len(lead_skips)} leads tried)."
            run.evidence = evidence
            return
        account_id = sending_account(store)
        campaign_id = create_campaign(store, account_id, drafts, now.astimezone(TEAM_TZ).date().isoformat())
        evidence.update({"campaign_id": campaign_id, "account_id": account_id})
        run.evidence = evidence
        run.decision = (
            f"Drafted {len(drafts)} first emails as campaign {campaign_id}, waiting for approval in Campaigns."
            + ("" if account_id else " No sending account is connected; pick one before approving.")
        )
