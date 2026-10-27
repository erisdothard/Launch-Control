"""Assemble index.html from the captured CRM screens, the template and the timeline.

Usage: python3 build/build.py <capture-dir>     (capture-dir = output of capture.py)
"""
import json
import os
import re
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.dirname(HERE)
ORDER = ["today_new", "lead_new", "lead_sent", "today_reply_closed", "today_reply_open",
         "calendar_call", "deals_before", "deals_after", "today_morning"]

RAIL = ["Inquiry", "Reply", "Follow-up", "Call", "Deal", "Won"]
LIVERY = '<div class="rule"><i style="width:50%;background:var(--color-accent)"></i><i style="width:30%;background:var(--color-livery-orange)"></i><i style="width:20%;background:var(--color-livery-red)"></i></div>'
CAPTIONS = {
    2: ("02 · Inquiry", "Every inquiry lands on Today.", "Who wrote, what they want, and what to do first.",
        ["Lead created from your website form", "Marked due today", "First on your list"]),
    3: ("03 · Reply", "Reply once. The follow-up is already set.", "If he goes quiet, the next email is drafted for you. If he answers, it stops.",
        ["Sent from your own mailbox", "Status: Contacted", "Follow-up due Friday"]),
    4: ("04 · He writes back", "Your answer is already written.", "Read it, change it if you want, and send. Nothing goes out without you.",
        ["His reply cancelled the follow-up", "Answer drafted for you", "You approve every send"]),
    5: ("05 · The call", "Book the call. It lands everywhere.", "On his record, in your Outlook, and his status moves on its own.",
        ["On Jake's record", "In your Outlook calendar", "Status: Meeting set"]),
    6: ("06 · Won", "Drag it to Won. He's a customer.", "The pipeline updates itself and the follow-ups stop.",
        ["Deal marked Won", "Customer created", "Follow-ups stopped"]),
    7: ("07 · Every morning", "One list. In order. Drafts ready.", "Replies, follow-ups and new inquiries, with your pipeline beside them.",
        ["Replies needed first", "Follow-ups due next", "New inquiries after"]),
}


def rail_html() -> str:
    parts = []
    for i, name in enumerate(RAIL):
        if i:
            parts.append(f'<div class="seg" id="sg{i}"><i></i></div>')
        parts.append(f'<div class="step" id="st{i}"><b><i class="lit"></i><i class="dot"></i></b>'
                     f'<span style="position:relative">{name}<span class="on" style="left:0;top:0">{name}</span></span></div>')
    return "\n".join(parts)


def captions_html() -> str:
    out = []
    for n, (no, h, p, ticks) in CAPTIONS.items():
        t = "".join(f'<div class="tick"><b>✓</b>{x}</div>' for x in ticks)
        out.append(f'<div class="cap" id="cap{n}"><div class="no">{no}</div>{LIVERY}<h2>{h}</h2><p>{p}</p><div class="ticks">{t}</div></div>')
    return "\n".join(out)


def main() -> None:
    cap = sys.argv[1]
    shutil.copytree(os.path.join(cap, "crm"), os.path.join(PROJECT, "crm"), dirs_exist_ok=True)
    screens = {s: open(os.path.join(cap, "screens", f"{s}.html")).read() for s in ORDER}
    # Ids repeat across captures (React ids); suffix them per screen so the page stays valid.
    for s in ORDER:
        screens[s] = re.sub(r'\bid="([^"]+)"', lambda m: f'id="{m.group(1)}-{s}"', screens[s])
        screens[s] = re.sub(r'\b(for|aria-labelledby|aria-controls|aria-describedby)="([^"]+)"', lambda m: f'{m.group(1)}="{m.group(2)}-{s}"', screens[s])
    html_screens = "\n".join(f'<div class="screen" id="s-{s}">{screens[s]}</div>' for s in ORDER)
    m = re.search(r'<article[^>]*data-hf="jakecard".*?</article>', screens["deals_before"], re.S)
    floater = m.group(0).replace('data-hf="jakecard"', "") if m else ""

    rects = json.load(open(os.path.join(cap, "rects.json")))
    tpl = open(os.path.join(HERE, "template.html")).read()
    js = open(os.path.join(HERE, "timeline.js")).read().replace("__RECTS__", json.dumps(rects))
    page = (tpl.replace("{{RAIL}}", rail_html()).replace("{{CAPTIONS}}", captions_html())
            .replace("{{SCREENS}}", html_screens).replace("{{TIMELINE}}", js)
            .replace('<div id="floater"></div>', f'<div id="floater">{floater}</div>'))
    open(os.path.join(PROJECT, "index.html"), "w").write(page)
    print("index.html", len(page) // 1024, "KB,", page.count("\n"), "lines")


if __name__ == "__main__":
    main()
