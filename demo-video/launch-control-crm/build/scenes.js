// Runs inside the real Launch Control CRM (localhost:3101). Rewrites the live DOM into one scene
// state for the sales video, marks camera targets with data-hf, and returns the shell HTML.
// Story (demo-video/SCRIPT.md): Northline Performance, owner Alex Morgan; driver Jake Turner.
window.HF = (() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const miss = [];
  const shell = () => $("div.fixed.inset-0");

  const OWNER = "Alex Morgan";
  const OWNER_EMAIL = "alex@northlineperformance.com";
  const SENDER = `${OWNER} · ${OWNER_EMAIL}`;

  function texts(root) {
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const out = [];
    let n;
    while ((n = w.nextNode())) out.push(n);
    return out;
  }
  function rep(root, from, to, quiet = false) {
    let hit = 0;
    for (const t of texts(root)) if (t.nodeValue.includes(from)) { t.nodeValue = t.nodeValue.split(from).join(to); hit++; }
    if (!hit && !quiet) miss.push(from);
  }
  function mark(el, id) {
    if (!el) return miss.push("mark:" + id);
    el.setAttribute("data-hf", id);
  }
  function need(el, what) {
    if (!el) miss.push("missing:" + what);
    return el;
  }

  // Real-to-sample pairs, injected by capture.py from build/private.json (never committed).
  const PRIVATE = window.__SCRUB || [];

  // Last pass on every scene: no real person, client or address survives into the video.
  function scrub() {
    const sh = shell();
    $$("select", sh).forEach((sel) => $$("option", sel).forEach((o, k) => { if (k > 0) o.remove(); }));
    PRIVATE.forEach(([a, b]) => rep(sh, a, b, true));
    $$("[role=radiogroup], fieldset", sh).forEach((g) => $$(":scope > *", g).slice(1).forEach((o) => o.remove()));
    $$("style", sh).forEach((st) => { if (st.textContent.includes("fonts.gstatic.com")) st.remove(); });
    $$("[role=img]", sh).filter((e) => /Signature/.test(e.getAttribute("aria-label") || "")).forEach((e) => (e.parentElement || e).remove());
    $$("[href]", sh).forEach((e) => e.setAttribute("href", "#"));
  }

  // ---------- shared ----------
  function common() {
    $$("nextjs-portal, script, .fixed.bottom-24").forEach((e) => e.remove());
    $$("[class*='today-module__']").forEach((e) =>
      e.classList.remove(...[...e.classList].filter((c) => c.startsWith("today-module__"))),
    );
    const sh = shell();
    PRIVATE.forEach(([a, b]) => rep(sh, a, b, true));
    const foot = $("aside div.mb-1.flex", sh);
    if (foot?.firstElementChild) foot.firstElementChild.textContent = "A";
    $$("aside nav span", sh).filter((e) => /^\d+$/.test(e.textContent.trim()) && Number(e.textContent) > 9).forEach((e) => (e.textContent = "3"));
  }

  // ---------- Today ----------
  function fillRow(li, r) {
    need($("button span.mt-px > span", li), "avatar").textContent = r.ini;
    need($("button span.text-\\[16px\\].font-semibold", li), "name").innerHTML =
      `${r.name}<span class="font-normal text-[var(--color-text-dim)]"> · ${r.co}</span>`;
    const start = $("button span.text-\\[14px\\].font-semibold.text-\\[var\\(--color-accent\\)\\]", li);
    if (start && !r.start) start.remove();
    const sub = $("button span.mt-\\[3px\\]", li);
    if (sub) { if (r.sub) sub.textContent = r.sub; else sub.remove(); }
    const tone = r.tone === "dim" ? "text-[var(--color-text-dim)]" : `text-[var(--color-${r.tone})] font-medium`;
    need($("button span.mt-1.flex", li), "status").innerHTML = `<span class="${tone}">${r.status}</span>${r.extra ? `<span>${r.extra}</span>` : ""}`;
    need($("button span.tabular", li), "amount").textContent = r.amount || "";
    need($("button > i", li), "bar").className = `self-stretch rounded-[2px] bg-[var(--color-${r.bar})]`;
    if (r.chevOpen === false) $("button svg", li)?.classList.remove("rotate-180");
    const hero = $(":scope > div", li);
    if (!hero) return;
    const bq = $("blockquote", hero);
    bq.firstChild.nodeValue = r.quote;
    $("small", bq).textContent = r.quoteBy;
    mark(bq, "quote");
    const well = $("div.well", hero);
    const sendAs = $("div.mt-3", hero);
    if (r.draft) { $("p", well).textContent = r.draft; mark(well, "draft"); }
    else { well.remove(); sendAs.remove(); }
    const btns = $("div.mt-4.flex", hero);
    const primary = $("button.btn-primary", btns);
    primary.textContent = r.primary;
    mark(primary, "primary");
    if (!r.draft) $("button.btn-secondary", btns)?.remove();
    $("a.btn-quiet", btns).textContent = `Open ${r.name.split(" ")[0]}'s record`;
  }

  function today(o) {
    common();
    const sh = shell();
    rep(sh, "Good evening, Max.", "Good morning, Alex.", true);
    rep(sh, "Good afternoon, Max.", "Good morning, Alex.", true);
    rep(sh, "Good morning, Max.", "Good morning, Alex.", true);
    const p = need($("header p", sh), "summary");
    if (o.bold) p.innerHTML = `<b class="font-semibold text-[var(--color-text)]">${o.bold}</b>${o.rest ? " " + o.rest : ""}`;
    mark(p, "summary");
    const tabs = o.clear ? [] : $$("section.card > div button", sh);
    if (o.tabs) o.tabs.forEach((n, i) => { const s = tabs[i] && $("span.tabular", tabs[i]); if (s) s.textContent = n; });
    const ul = o.clear ? null : $("section.card ul", sh);
    if (o.clear) {
      const rail = '<div class="absolute inset-y-0 left-0 flex w-[5px] flex-col"><i class="flex-[5] bg-[var(--color-accent)]"></i><i class="flex-[3] bg-[var(--color-livery-orange)]"></i><i class="flex-[2] bg-[var(--color-livery-red)]"></i></div>';
      $("section.card", sh).outerHTML = `<section aria-label="You're clear" class="card relative overflow-hidden">${rail}<div class="px-7 py-9 sm:px-[34px] sm:py-10"><p class="font-display text-[18px] tracking-[0.04em] text-[var(--color-steel)] uppercase">You're clear</p><p class="mt-2.5 text-[16px] text-[var(--color-text-muted)]">No replies needed, no follow-ups due and no new inquiries. New replies will show up here.</p></div></section>`;
    } else if (o.rows) {
      const lis = $$(":scope > li", ul);
      const heroTpl = lis[0];
      const rowTpl = lis[1];
      const keep = o.keep ? o.keep.map((i) => lis[i]) : [];
      ul.innerHTML = "";
      o.rows.forEach((r) => {
        const li = (r.open ? heroTpl : rowTpl).cloneNode(true);
        fillRow(li, r);
        ul.appendChild(li);
      });
      keep.forEach((li) => ul.appendChild(li));
    }
    if (!o.clear) {
      $$(":scope > li", ul).forEach((li, i) => { mark(li, "row" + i); mark($("button > span:last-child", li), "chev" + i); });
      mark($("section.card", sh), "list");
    }
    const aside = $("aside.flex.min-w-0", sh);
    (o.times || ["7:30", "10:42", "1:00", "3:30"]).forEach((t, k) => { const e = $$("span.font-mono", $(":scope > section", aside))[k]; if (e) e.textContent = t; });
    (o.right || []).forEach(([a, b]) => rep(aside, a, b, true));
    const pipeSec = $$(":scope > section", aside)[1];
    const counts = o.won ? ["2", "2", "2"] : ["2", "2", "3"];
    $$("ul li span", pipeSec).forEach((e, k) => { if (counts[k]) e.textContent = counts[k]; });
    const bars = o.won ? [64, 43, 22.5] : [64, 43, 31];
    $$("div.mt-3 i", pipeSec).forEach((e, k) => (e.style.flex = String(bars[k])));
    mark(aside, "right");
    mark($$(":scope > section", aside)[1], "pipeline");
  }

  // Kevin (Apex Track Days) and Sofia (Coastline Karting) are the CRM demo's own sample leads.
  const ROW = {
    jakeNew: {
      open: true, start: true, ini: "JT", name: "Jake Turner", co: "Spec Miata racer", tone: "dim", status: "New inquiry · website, 7:58am",
      amount: "", bar: "accent",
      quote: "“Saw you run arrive-and-drive race weekends. Two seasons of Spec Miata, ready to try open wheel. What would a weekend in the F2000 look like?”",
      quoteBy: "Jake, through northlineperformance.com", primary: "Write email",
    },
    jakeReplyOpen: {
      open: true, start: true, ini: "JT", name: "Jake Turner", co: "Spec Miata racer", tone: "hot", status: "Waiting 2 hours", extra: "Reply drafted",
      amount: "", bar: "livery-red",
      quote: "“That sounds right. What does the F2000 weekend cost, and what do you need from me to book it?”",
      quoteBy: "Jake, today 9:48am",
      draft: "Hi Jake, glad it sounds right. Easiest is a quick call: I'll walk you through the F2000 weekend, what's included and pricing, and we can pick your dates. Does Thursday at 1:00 work?",
      primary: "Send reply",
    },
    jakeReplyClosed: {
      ini: "JT", name: "Jake Turner", co: "Spec Miata racer", sub: "Wrote: “That sounds right. What does the F2000 weekend cost?”",
      tone: "hot", status: "Waiting 2 hours", extra: "Reply drafted", amount: "", bar: "livery-red", chevOpen: false,
    },
    kevin: { ini: "KO", name: "Kevin Osei", co: "Apex Track Days", sub: "Wrote: “Confirmed for 1:00. Who else should join from your side?”", tone: "hot", status: "Waiting 40 minutes", extra: "Reply drafted", amount: "$22,500", bar: "livery-red" },
    sofia: { ini: "SL", name: "Sofia Laurent", co: "Coastline Karting", sub: "Proposal went out Friday, no reply. Second follow-up is due today.", tone: "warm", status: "Follow-up due today", extra: "Follow-up drafted", amount: "$16,000", bar: "livery-orange" },
  };
  const DAY = [["Team sync", "Crew meeting"], ["Alex, Sam", "Shop · whole crew"]];
  const PIPE_PRE = [["$214,500", "$138,000"], ["$96,000", "$64,000"], ["$78,000", "$43,000"], ["$40,500", "$31,000"],
    ["$62,000", "$18,500"], ["Three deals closed", "One deal closed"], ["24%", "40%"], ["12 of 50 people you emailed wrote back", "4 of 10 people you emailed wrote back"]];
  const PIPE_POST = [["$214,500", "$129,500"], ["$96,000", "$64,000"], ["$78,000", "$43,000"], ["$40,500", "$22,500"],
    ["$62,000", "$27,000"], ["Three deals closed", "Two deals closed"], ["24%", "40%"], ["12 of 50 people you emailed wrote back", "4 of 10 people you emailed wrote back"]];
  const RIGHT = [...DAY, ...PIPE_PRE];

  // ---------- Lead record (real fields only) ----------
  const MSG_IN = { ini: "JT", inbound: true, from: "Jake Turner", when: "Tue, Oct 27, 7:58 AM", addr: "jake.turner@gmail.com", to: OWNER_EMAIL,
    body: "Hi,\n\nSaw you run arrive-and-drive race weekends. Two seasons of Spec Miata, ready to try open wheel. What would a weekend in the F2000 look like?\n\nJake" };
  const REPLY = "Hi Jake, thanks for reaching out.\n\nOur F2000 race weekends are built for exactly that jump: car, coach and crew handled, so you just drive. Your Spec Miata seasons are a great base.\n\nWant me to send the details?";
  const MSG_OUT = { ini: "AM", from: OWNER, when: "Tue, Oct 27, 9:12 AM", addr: OWNER_EMAIL, to: "jake.turner@gmail.com", body: REPLY + "\n\nAlex" };
  const MSG_IN2 = { ini: "JT", inbound: true, from: "Jake Turner", when: "Tue, Oct 27, 9:48 AM", addr: "jake.turner@gmail.com", to: OWNER_EMAIL,
    body: "That sounds right. What does the F2000 weekend cost, and what do you need from me to book it?\n\nJake" };
  const MSG_OUT2 = { ini: "AM", from: OWNER, when: "Tue, Oct 27, 11:52 AM", addr: OWNER_EMAIL, to: "jake.turner@gmail.com",
    body: "Hi Jake, glad it sounds right. Easiest is a quick call: I'll walk you through the F2000 weekend, what's included and pricing, and we can pick your dates. Does Thursday at 1:00 work?\n\nAlex" };
  const FACTS = [
    ["Email", "jake.turner@gmail.com"], ["Phone", "+1 (404) 555-0148"], ["Source", "Website · northlineperformance.com/contact"],
    ["Added", "Oct 27, 2026"], ["Notes", "Two seasons of Spec Miata. Interested in F2000 arrive-and-drive weekends."],
  ];
  const LEAD = {
    new: { status: "New", dot: "accent", detail: "Website form", date: "Oct 27", next: "Reply to his website inquiry", due: "Due today", dueTone: "warm",
      nextSub: "Came in through northlineperformance.com/contact", msgs: [MSG_IN], history: [["Added from the website form", "Oct 27, 7:58 AM"]] },
    meeting: { status: "Meeting set", dot: "accent", detail: "Call booked", date: "Thu, Oct 29 · 1:00", next: "Send the proposal after the call", due: "Thu, Oct 29", dueTone: "text-dim",
      nextSub: "The call is on his record and in your Outlook calendar.", meet: "Thu, Oct 29 · 1:00 · Call · F2000 race weekend",
      msgs: [MSG_IN, MSG_OUT, MSG_IN2, MSG_OUT2], history: [["Meeting booked · Thu, Oct 29, 1:00", "Oct 27, 12:20 PM"], ["Reply sent", "Oct 27, 11:52 AM"], ["He replied", "Oct 27, 9:48 AM"], ["Email sent", "Oct 27, 9:12 AM"], ["Added from the website form", "Oct 27, 7:58 AM"]] },
    sent: { status: "Contacted", dot: "text-dim", detail: "First email sent", date: "Oct 27", next: "Follow up if no reply", due: "Due Fri, Oct 30", dueTone: "text-dim",
      nextSub: "Drafted for you if he doesn't answer. Stops the moment he does.", msgs: [MSG_IN, MSG_OUT],
      history: [["Email sent", "Oct 27, 9:12 AM"], ["Added from the website form", "Oct 27, 7:58 AM"]] },
  };

  function lead(o, compose) {
    common();
    const sh = shell();
    const art = need($("article.card", sh), "article");
    const pill = need($("span.inline-flex.items-center.gap-2.whitespace-nowrap.rounded-full", art), "pill");
    pill.innerHTML = `<span class="h-1.5 w-1.5 rounded-full bg-[var(--color-${o.dot})]"></span>${o.status}`;
    mark(pill, "pill");
    pill.nextElementSibling.innerHTML = `${o.detail}<span class="text-[var(--color-text-dim)]"> · <time class="tabular">${o.date}</time></span>`;
    need($("div.mt-5 span.grid", art), "lead avatar").textContent = "JT";
    $("h1", art).textContent = "Jake Turner";
    $("h1", art).nextElementSibling.textContent = "jake.turner@gmail.com";
    const ns = need($("section.well", art), "next step");
    const tone = o.dueTone === "text-dim" ? "text-[var(--color-text-dim)]" : `text-[var(--color-${o.dueTone})]`;
    $("p.order-last", ns).innerHTML = `${o.next}<span class="ml-2 text-[15px] font-medium ${tone}">${o.due}</span>`;
    $("p.mt-1.text-sm", ns).textContent = o.nextSub;
    $("div.mt-3.border-t", ns)?.remove();
    mark(ns, "next");
    rep(art, "+1 (317) 414-1124", "+1 (404) 555-0148", true);
    mark(art, "hero");

    const dl = need($("dl", sh), "facts");
    const tpl = $(":scope > div", dl);
    dl.innerHTML = "";
    FACTS.forEach(([k, v]) => { const d = tpl.cloneNode(true); $("dt", d).textContent = k; $("dd", d).textContent = v; dl.appendChild(d); });
    mark(dl.closest("section"), "facts");

    const ol = need($("ol.divide-y", sh), "messages");
    const mtpl = $(":scope > li", ol);
    ol.innerHTML = "";
    o.msgs.forEach((m, i) => {
      const li = mtpl.cloneNode(true);
      const av = $("header > span", li);
      av.textContent = m.ini;
      if (m.inbound) { av.style.background = "#1b2530"; av.style.color = "#c3d6ea"; }
      $("header p.text-\\[16px\\]", li).textContent = m.from;
      $("time", li).textContent = m.when;
      $("header p.mt-0\\.5", li).innerHTML = `<span class="text-[var(--color-text-muted)]">${m.addr} </span>to ${m.to}`;
      $("div.mt-4", li).textContent = m.body;
      mark(li, "msg" + i);
      ol.appendChild(li);
    });
    rep(sh, "1 in this conversation", `${o.msgs.length} in this conversation`, true);
    mark(ol.closest("section"), "emailcard");

    const form = $("form.card", sh);
    if (form) {
      const ta = $("textarea", form);
      if (ta) { ta.textContent = compose || ""; mark(ta, "textarea"); }
      mark(form, "composer");
      mark($$("button", form).find((b) => /Send/.test(b.textContent)), "send");
    }
    const meet = $$("section.card", sh).find((s) => $("h2", s)?.textContent.trim() === "Meetings");
    if (meet && o.meet) { const p = $("p", meet); p.textContent = o.meet; p.className = "mt-2 text-[15px] text-[var(--color-text)]"; mark(meet, "meetings"); }
    mark($$("button", sh).find((b) => b.textContent.trim() === "Create deal"), "createdeal");
    const hist = $$("section.card", sh).find((s) => $("h2", s)?.textContent.trim() === "History");
    if (hist) {
      const hol = $("ol", hist);
      const htpl = $(":scope > li", hol);
      hol.innerHTML = "";
      o.history.forEach(([t, w], k) => {
        const li = htpl.cloneNode(true);
        $("div.min-w-0", li).innerHTML = `<p class="text-[15px] text-[var(--color-text)]">${t}</p><p class="mt-0.5 text-sm text-[var(--color-text-dim)]">${w}</p>`;
        if (k === o.history.length - 1) li.querySelector("span.absolute")?.remove();
        hol.appendChild(li);
      });
    }
  }

  // ---------- Calendar ----------
  function calendar() {
    common();
    const sh = shell();
    const chips = $$("div.mb-5.flex button", sh);
    ["2", "2", "6", "1"].forEach((n, i) => { const s = chips[i] && $("span.tabular", chips[i]); if (s) s.textContent = n; });
    const cells = $$("div.grid.grid-cols-7 > button", sh);
    const chip = (time, title, color) =>
      `<span class="flex min-w-0 gap-1.5 text-sm leading-tight text-[var(--color-text)]"><span aria-hidden="true" class="w-[3px] shrink-0 self-stretch rounded-full bg-[var(--color-${color})]"></span><span class="min-w-0"><span class="block font-mono text-[13px] text-[var(--color-text-dim)]">${time}</span><span class="block truncate">${title}</span></span></span>`;
    const plan = { "2026-10-28": [["10:00", "Shop walk-through", "success"]], "2026-10-29": [["1:00", "Call · Jake Turner", "accent"]], "2026-10-31": [["8:00", "Test day · Roebling", "success"]], "2026-10-30": [["2:00", "Call · Kevin Osei", "accent"]] };
    cells.forEach((c) => {
      const day = (c.getAttribute("aria-label") || "").slice(0, 10);
      const list = $("span.hidden.flex-col", c);
      if (list) list.innerHTML = (plan[day] || []).map((e) => chip(...e)).join("");
      const dots = $("span.sm\\:hidden", c);
      if (dots) dots.innerHTML = "";
      if (day === "2026-10-29") { c.style.background = "var(--color-bg-hover)"; c.style.boxShadow = "inset 0 0 0 1.5px var(--color-accent-border)"; mark(c, "day29"); }
    });
    const aside = need($("aside[aria-labelledby=day-heading]", sh), "day panel");
    $("h2", aside).textContent = "Thursday, October 29";
    const empty = $$("p", aside);
    empty.forEach((e) => e.remove());
    aside.insertAdjacentHTML("beforeend",
      `<ul><li class="grid grid-cols-[54px_1fr] gap-3 border-t border-[var(--color-border)] py-3" data-hf="callitem"><span class="pt-px font-mono text-[14px] text-[var(--color-text)]">1:00</span><div class="min-w-0"><p class="text-[15px] text-[var(--color-text)]">Call · Jake Turner</p><p class="mt-px text-[14px] text-[var(--color-text-muted)]">F2000 race weekend · phone · 30 min</p><p class="mt-2 text-[14px] text-[var(--color-text-dim)]">On Jake's record · in Outlook · status: Meeting set</p></div></li></ul>`);
    mark(aside, "daypanel");
  }

  // ---------- Pipeline (the demo board plus Jake) ----------
  function deals(won) {
    common();
    const sh = shell();
    $$("p.well", sh).forEach((e) => e.remove());
    const cols = $$("div.grid.grid-cols-1 > section", sh);
    const byName = (n) => cols.find((c) => $("header h2", c)?.textContent.trim() === n);
    const inq = byName("Inquiry");
    const wonCol = byName("Won");
    const card = $("article", byName("Proposal out")).cloneNode(true);
    $("h3", card).textContent = "Jake Turner";
    $("p.mt-0\\.5", card).textContent = "F2000 race weekend";
    $("p.tabular", card).textContent = "$8,500";
    $("span.line-clamp-2", card).textContent = won ? "Signed · now a customer" : "Proposal after Thursday's call";
    const foot = $("div.mt-3.flex span", card);
    if (foot) foot.lastChild.nodeValue = "Today";
    mark(card, "jakecard");
    (won ? $("div.space-y-2", wonCol) : $("div.space-y-2", inq)).appendChild(card);
    const setHead = (col, count, total) => { $("header span.tabular", col).textContent = count; $("header p", col).textContent = total; };
    setHead(inq, won ? "2" : "3", won ? "$22,500" : "$31,000");
    setHead(wonCol, won ? "2" : "1", won ? "$27,000" : "$18,500");
    $("header p", sh).textContent = won
      ? "Six open deals worth $129,500. Won this quarter: $27,000, and Jake is now a customer."
      : "Seven open deals worth $138,000. Drag a card, or use Move, to change its stage.";
    mark(inq, "colinq");
    mark(wonCol, "colwon");
    mark($("header", wonCol), "wonhead");
  }

  const states = {
    today_before() { today({ bold: "Nothing needs you right now.", rest: "", clear: true, right: RIGHT, times: ["7:30", "7:52", "1:00", "3:30"] }); },
    lead_meeting() { lead(LEAD.meeting); },
    today_new() { today({ bold: "One new inquiry.", rest: "Start with Jake Turner, who came in through your website.", tabs: ["1", "0", "0", "1"], rows: [ROW.jakeNew], right: RIGHT, times: ["7:30", "8:05", "1:00", "3:30"] }); },
    lead_new() { lead(LEAD.new); },
    lead_compose() { lead(LEAD.new, REPLY); },
    lead_sent() { lead(LEAD.sent); },
    today_reply_closed() { today({ bold: "Two replies needed. One follow-up due.", rest: "Three drafted. Start with Jake, who has been waiting 2 hours.", tabs: ["3", "2", "1", "0"], rows: [ROW.jakeReplyClosed, ROW.kevin, ROW.sofia], right: RIGHT, times: ["7:30", "11:50", "1:00", "3:30"] }); },
    today_reply_open() { today({ bold: "Two replies needed. One follow-up due.", rest: "Three drafted. Start with Jake, who has been waiting 2 hours.", tabs: ["3", "2", "1", "0"], rows: [ROW.jakeReplyOpen, ROW.kevin, ROW.sofia], right: RIGHT, times: ["7:30", "11:50", "1:00", "3:30"] }); },
    calendar_call() { calendar(); },
    deals_before() { deals(false); },
    deals_after() { deals(true); },
    today_morning() { today({ right: [...DAY, ...PIPE_POST], won: true }); },
  };

  return {
    run(name) { states[name](); scrub(); return miss; },
    rects() {
      const sh = shell().getBoundingClientRect();
      const out = {};
      $$("[data-hf]").forEach((e) => {
        const r = e.getBoundingClientRect();
        out[e.getAttribute("data-hf")] = { x: Math.round(r.left - sh.left), y: Math.round(r.top - sh.top), w: Math.round(r.width), h: Math.round(r.height) };
      });
      return out;
    },
    html() { scrub(); return shell().outerHTML; },
  };
})();
