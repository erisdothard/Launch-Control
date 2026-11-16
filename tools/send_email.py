#!/usr/bin/env python3
"""Send one plain-text email as eris@golaunchcontrol.com through Microsoft Graph.

The CRM's Microsoft app may only use Maxwell's mailbox (Exchange app access policy); eris@ is
connected in the CRM as a send-as address on that mailbox (email_accounts.mailbox), the same way
campaigns go out. So this sends from Maxwell's mailbox with From set to eris@. Replaces driving
Mac Mail with AppleScript, which failed on attachments and left stuck copies (2026-11-16).

Credentials come from crm/.env.local (MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET,
MS_APP_MAILBOX) and are never printed.

    python3 tools/send_email.py --to max@... --subject "..." --body-file body.txt [--attach file] [--from eris@golaunchcontrol.com]

Exits non-zero unless Graph accepted the message, then confirms it in Sent Items.
"""

from __future__ import annotations

import argparse
import base64
import json
import mimetypes
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GRAPH = "https://graph.microsoft.com/v1.0"
MAX_ATTACH_BYTES = 3 * 1024 * 1024  # Graph's limit for attachments sent inline with sendMail


def env() -> dict[str, str]:
    out: dict[str, str] = {}
    for line in (ROOT / "crm/.env.local").read_text().splitlines():
        line = line.strip()
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            out[k] = v.strip().strip('"')
    return out


def token(e: dict[str, str]) -> str:
    data = urllib.parse.urlencode({"client_id": e["MS_CLIENT_ID"], "client_secret": e["MS_CLIENT_SECRET"],
                                   "scope": "https://graph.microsoft.com/.default",
                                   "grant_type": "client_credentials"}).encode()
    req = urllib.request.Request(f"https://login.microsoftonline.com/{e['MS_TENANT_ID']}/oauth2/v2.0/token", data=data)
    return json.load(urllib.request.urlopen(req, timeout=30))["access_token"]


def call(tok: str, method: str, path: str, body: dict | None = None) -> tuple[int, bytes]:
    req = urllib.request.Request(f"{GRAPH}{path}", method=method,
                                 data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as err:
        return err.code, err.read()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--to", required=True, action="append")
    ap.add_argument("--subject", required=True)
    ap.add_argument("--body-file", required=True)
    ap.add_argument("--attach", action="append", default=[])
    ap.add_argument("--from", dest="sender", default="eris@golaunchcontrol.com")
    a = ap.parse_args()

    attachments = []
    for f in a.attach:
        p = Path(f)
        if p.stat().st_size > MAX_ATTACH_BYTES:
            print(f"{p.name} is over {MAX_ATTACH_BYTES // 1024 // 1024} MB; host it and send a link", file=sys.stderr)
            return 2
        attachments.append({"@odata.type": "#microsoft.graph.fileAttachment", "name": p.name,
                            "contentType": mimetypes.guess_type(p.name)[0] or "application/octet-stream",
                            "contentBytes": base64.b64encode(p.read_bytes()).decode()})

    e = env()
    tok = token(e)
    mailbox = e["MS_APP_MAILBOX"]
    msg = {"subject": a.subject, "body": {"contentType": "Text", "content": Path(a.body_file).read_text()},
           "from": {"emailAddress": {"address": a.sender}},
           "toRecipients": [{"emailAddress": {"address": t}} for t in a.to]}
    if attachments:
        msg["attachments"] = attachments
    status, raw = call(tok, "POST", f"/users/{mailbox}/sendMail", {"message": msg, "saveToSentItems": True})
    if status != 202:
        print(f"NOT SENT: Graph returned {status}: {raw[:300].decode(errors='replace')}", file=sys.stderr)
        return 1
    print(f"accepted by Microsoft (202) from {a.sender} to {', '.join(a.to)}")

    q = urllib.parse.urlencode({"$top": "5", "$orderby": "sentDateTime desc", "$select": "subject,sentDateTime,from,hasAttachments"})
    for _ in range(6):
        time.sleep(5)
        status, raw = call(tok, "GET", f"/users/{mailbox}/mailFolders/sentitems/messages?{q}")
        if status == 200:
            for m in json.loads(raw)["value"]:
                if m["subject"] == a.subject:
                    print(f"in Sent Items: {m['sentDateTime']} from {m['from']['emailAddress']['address']}"
                          f"{' with attachment' if m.get('hasAttachments') else ''}")
                    return 0
    print("accepted, but not yet visible in Sent Items", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
