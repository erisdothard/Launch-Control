"""Capture every scene state from the real CRM running on localhost:3101.

Usage: python3 capture.py <session-token.json> <out-dir>
Writes <out-dir>/screens/<state>.html, <out-dir>/rects.json, <out-dir>/crm/crm.css + fonts,
and <out-dir>/check/<state>.png for review.
"""
import json
import os
import re
import sys
import time
import urllib.request

from playwright.sync_api import sync_playwright

BASE = "http://localhost:3101"
LEAD_URL = "/admin/leads/c59aac38-a689-4c78-8d01-98ca943c894d"
PAGES = {
    "today": "/admin/dashboard?demo=1",
    "lead": LEAD_URL,
    "board": "/admin/deals?demo=1",
    "calendar": "/admin/calendar",
}
STATES = {
    "today_new": "today", "lead_new": "lead", "lead_compose": "lead", "lead_sent": "lead",
    "today_reply_closed": "today", "today_reply_open": "today", "calendar_call": "calendar",
    "deals_before": "board", "deals_after": "board", "today_morning": "today",
}
# Real client data that must never reach the video.
FORBIDDEN = re.compile(r"client-a|client-b|client-c|Client C|maxwell@|Maxwell|eris@|Eris|Alex|arrivedrive|646\.942|Test Driver|E2E|, Max\.", re.I)


def main() -> None:
    tok = json.load(open(sys.argv[1]))
    out = sys.argv[2]
    here = os.path.dirname(os.path.abspath(__file__))
    js = open(os.path.join(here, "scenes.js")).read()
    for d in ("screens", "check", "crm/media"):
        os.makedirs(os.path.join(out, d), exist_ok=True)

    rects, css_urls, problems = {}, set(), []
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome")
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        page.on("response", lambda r: css_urls.add(r.url) if ".css" in r.url.split("?")[0][-5:] else None)
        page.goto(f"{BASE}/admin/update-password#access_token={tok['a']}&refresh_token={tok['r']}")
        time.sleep(6)
        for state, kind in STATES.items():
            page.goto(BASE + PAGES[kind], wait_until="networkidle")
            time.sleep(2.5)
            page.add_script_tag(content=js)
            miss = page.evaluate(f"HF.run('{state}')")
            time.sleep(2.0)
            rects[state] = page.evaluate("HF.rects()")
            html = page.evaluate("HF.html()")
            leaks = sorted(set(m.group(0) for m in FORBIDDEN.finditer(html)))
            if miss or leaks:
                problems.append((state, miss, leaks))
            open(os.path.join(out, "screens", f"{state}.html"), "w").write(html)
            page.screenshot(path=os.path.join(out, "check", f"{state}.png"))
            print(state, "ok" if not (miss or leaks) else f"MISS={miss} LEAK={leaks}")
        browser.close()

    json.dump(rects, open(os.path.join(out, "rects.json"), "w"), indent=1)
    # Compiled stylesheet + every font it references, rewritten to local paths.
    css = ""
    for u in sorted(css_urls):
        css += urllib.request.urlopen(u).read().decode("utf-8") + "\n"
    for f in sorted(set(re.findall(r"\.\./media/([^\")]+\.woff2)", css))):
        dst = os.path.join(out, "crm/media", f)
        if not os.path.exists(dst):
            urllib.request.urlretrieve(f"{BASE}/_next/static/media/{f}", dst)
    css = css.replace("../media/", "media/")
    open(os.path.join(out, "crm/crm.css"), "w").write(css)
    print("css files:", len(css_urls), "problems:", problems)


if __name__ == "__main__":
    main()
