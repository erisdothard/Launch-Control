/* Launch Control paddock: simulated state + crew behaviour + rail wiring.
   Truth contract: nothing on screen moves unless a sim event fires, and every event logs a row.
   Rendering is delegated to window.Paddock (world.js). All data here is simulated. */
(function () {
  "use strict";
  const P = window.Paddock;
  if (!P) { console.error("sim.js: window.Paddock missing (world.js not loaded)"); return; }
  const ST = P.STATIONS;
  const COL = { yellow: "#f0c419", orange: "#f07d1a", red: "#e3261d", green: "#2bb24c", blue: "#9ec5e8", steel: "#c6ccd3" };
  const SPEED_TILES = 2.2;
  const LAP_S = 26, LAP_GAP_S = 6;
  const $ = (id) => document.getElementById(id);

  /* ---------- state ---------- */
  const S = {
    paused: false, speed: 1, halted: false, bounceSpike: false, lap: 1, lapT: 0, carT: -1, lightsOut: 0,
    leads: 0, keptTotal: 0, usableTotal: 0, usable: 0, sends: 0, bounce: 0.6, replies: 0, meetings: 0, closes: 0, m: 0, f: 0,
    pendingLeads: [],       // cohorts of usable leads waiting at the prospector's desk
    writerLeads: [],        // cohorts of usable leads held by the writer
    draftBatch: null,       // cohorts carried on the current draft
    approved: false,        // writer holds an approved batch waiting for the runner
    handoffDone: false,
    proposal: null,         // 'carried' | 'approved' | null
    pendingReplies: 0,
    towerStatus: "ok", checking: 0,
  };
  const pings = [];
  const glow = { prospector: 0, writer: 0, strategist: 0, tower: 0, radio: 0, board: 0, pitwall: 0 };
  let clock = 0;

  /* ---------- crew ---------- */
  function member(id, color, tile, seated) {
    return { id, c: tile[0], r: tile[1], color, facing: 1, walking: false, frame: 0, carrying: null, bubble: null, seated: !!seated, home: tile.slice(), queue: [], frameT: 0, bob: 0 };
  }
  const crew = {
    prospector: member("prospector", COL.yellow, ST.prospector.desk),
    writer: member("writer", COL.steel, ST.writer.desk),
    strategist: member("strategist", COL.orange, ST.strategist.desk),
    mc: member("mc", COL.steel, ST.pitwallMC.seat, true),
    eris: member("eris", COL.green, ST.pitwallEris.seat, true),
    radio: member("radio", COL.blue, ST.radio.front),
    guardian: member("guardian", COL.red, ST.tower.guardian, true),
  };
  const ALL = Object.values(crew);
  const tileOf = (m) => [Math.round(m.c), Math.round(m.r)];
  const beside = (t, dc) => [t[0] + dc, t[1]];
  const ERIS_FRONT = ST.pitwallEris.front;
  const RUNNER_FRONT = beside(ERIS_FRONT, -1);
  const STRAT_FRONT = beside(ERIS_FRONT, 1);
  const WRITER_HANDOFF = beside(ST.writer.desk, 1);
  const PROSPECTOR_HANDOFF = beside(ST.prospector.desk, 1);

  // Task queue primitives. Each task: { type, ... }.
  const walk = (to) => ({ type: "walk", to: to.slice() });
  const wait = (sec, bubble) => ({ type: "wait", t: sec, bubble: bubble || null });
  const set = (props) => ({ type: "set", props });
  const call = (fn) => ({ type: "call", fn });
  const until = (pred, bubbleFn) => ({ type: "until", pred, bubbleFn });
  const busy = (m) => m.queue.length > 0;

  function stepMember(m, dt) {
    const task = m.queue[0];
    if (!task) { m.walking = false; return; }
    if (task.type === "set") { Object.assign(m, task.props); m.queue.shift(); return stepMember(m, dt); }
    if (task.type === "call") { m.queue.shift(); task.fn(m); return; }
    if (task.type === "wait") { m.bubble = task.bubble; task.t -= dt; if (task.t <= 0) { m.bubble = null; m.queue.shift(); } return; }
    if (task.type === "until") { m.bubble = task.bubbleFn ? task.bubbleFn() : null; if (task.pred()) { m.bubble = null; m.queue.shift(); } return; }
    if (task.type === "walk") {
      if (!task.path) {
        const from = tileOf(m);
        task.path = P.findPath(from, task.to);
        if (!task.path || task.path.length === 0) { m.c = task.to[0]; m.r = task.to[1]; m.queue.shift(); return; }
        if (task.path[0][0] === from[0] && task.path[0][1] === from[1]) task.path.shift();
        if (task.path.length === 0) { m.queue.shift(); return; }
        task.idx = 0; task.prog = 0; task.from = [m.c, m.r];
      }
      m.walking = true;
      m.frameT += dt; if (m.frameT >= 0.15) { m.frameT = 0; m.frame = (m.frame + 1) % 2; }
      const target = task.path[task.idx];
      const dist = Math.max(0.0001, Math.hypot(target[0] - task.from[0], target[1] - task.from[1]));
      task.prog += SPEED_TILES * dt / dist;
      const dx = target[0] - task.from[0];
      if (dx !== 0) m.facing = dx > 0 ? 1 : -1;
      if (task.prog >= 1) {
        m.c = target[0]; m.r = target[1]; task.idx++; task.prog = 0; task.from = [m.c, m.r];
        if (task.idx >= task.path.length) { m.walking = false; m.queue.shift(); }
      } else {
        m.c = task.from[0] + (target[0] - task.from[0]) * task.prog;
        m.r = task.from[1] + (target[1] - task.from[1]) * task.prog;
      }
    }
  }

  /* ---------- feed / cards ---------- */
  const feedEl = $("feed");
  function log(agent, status, decision) {
    const li = document.createElement("li");
    li.className = status;
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0"), mm = String(now.getMinutes()).padStart(2, "0"), ss = String(now.getSeconds()).padStart(2, "0");
    li.innerHTML = `<span class="t">${hh}:${mm}:${ss}</span><span class="a">${agent}</span><span class="d">${decision}</span>`;
    feedEl.prepend(li);
    while (feedEl.children.length > 7) feedEl.lastChild.remove();
    document.querySelectorAll(".own").forEach((el) => {
      if (el.dataset.agent === agent) { el.classList.add("active"); setTimeout(() => el.classList.remove("active"), 1400); }
    });
  }
  function ping(tile, kind) { pings.push({ c: tile[0], r: tile[1], kind, t: 0 }); }

  /* ---------- behaviours ---------- */
  let nextLead = 1.0, nextProspectorRun = 4.0, nextDispatch = 0.8, dispatchCount = 0, nextStrat = 16, guardianAt = 7, writerReadyAt = 0, replyAt = [];

  function spawnLead() {
    S.leads++; S.keptTotal++;
    const ok = Math.random() < 0.78;
    const cohort = Math.random() < 0.65 ? "m" : "f";
    if (ok) { S.usableTotal++; S.pendingLeads.push(cohort); }
    S.usable = Math.round(100 * S.usableTotal / S.keptTotal);
    glow.prospector = 1;
  }

  function prospectorDelivers() {
    const m = crew.prospector;
    if (busy(m) || S.pendingLeads.length === 0) return;
    const batch = S.pendingLeads.splice(0, S.pendingLeads.length);
    log("prospector", "done", `cohort ${batch.filter((c) => c === "m").length >= batch.length / 2 ? "motorsport" : "freight"}: ${batch.length} usable, usable-rate ${S.usable}%`);
    m.queue.push(set({ carrying: "leads" }), walk(WRITER_HANDOFF), call(() => {
      S.writerLeads.push(...batch); glow.writer = 1; m.carrying = null;
      writerReadyAt = clock + 2 + Math.random();
    }), walk(m.home), set({ facing: 1 }));
  }

  function writerDrafts() {
    const m = crew.writer;
    if (busy(m) || S.writerLeads.length === 0 || clock < writerReadyAt || S.draftBatch) return;
    const batch = S.writerLeads.splice(0, Math.min(5, S.writerLeads.length));
    S.draftBatch = batch; S.approved = false; S.handoffDone = false;
    log("outreach-writer", "done", `${batch.length} drafts from score evidence, status draft`);
    let okT = 0;
    m.queue.push(
      set({ carrying: "draft" }),
      walk(ERIS_FRONT),
      call(() => { glow.pitwall = 1; okT = 0; }),
      until(() => { if (S.halted) { okT = 0; return false; } return okT >= 1.2; }, () => (S.halted ? "halt" : "wait")),
      call(() => {
        crew.eris.bubble = "ok"; setTimeout(() => { if (crew.eris.bubble === "ok") crew.eris.bubble = null; }, 1000);
        ping(ST.pitwallEris.seat, "check"); m.carrying = "approved"; S.approved = true;
        log("eris", "done", `approved ${batch.length} drafts at the pit wall`);
      }),
      until(() => S.handoffDone, () => (S.halted ? "halt" : null)),
      walk(m.home), set({ facing: 1 }),
      call(() => { S.draftBatch = null; })
    );
    // the approval clock advances only while the writer is at the wall and the flag is green
    m.approvalTick = (dt) => { const t = m.queue[0]; if (t && t.type === "until" && !S.halted) okT += dt; };
  }

  function runnerHandoff() {
    const m = crew.radio;
    if (busy(m) || !S.approved || S.handoffDone) return;
    const batch = S.draftBatch || [];
    m.queue.push(
      walk(RUNNER_FRONT),
      call(() => { m.carrying = "approved"; crew.writer.carrying = null; S.handoffDone = true; S.approved = false; }),
      walk(ST.radio.front),
      call(() => {
        m.carrying = null; ping(ST.radio.front, "send"); glow.radio = 1;
        S.sends += batch.length;
        batch.forEach((c) => { if (c === "m") S.m++; else S.f++; });
        log("sender", "done", `${batch.length} sent via team radio, cap ${S.sends}/60`);
        batch.forEach(() => { if (Math.random() < 0.22) replyAt.push(clock + 2 + Math.random() * 3); });
      })
    );
  }

  function runnerReplies() {
    const m = crew.radio;
    if (busy(m) || S.pendingReplies === 0) return;
    S.pendingReplies--;
    const meeting = Math.random() < 0.35;
    m.queue.push(
      set({ carrying: "reply" }),
      walk(ST.board.front),
      call(() => {
        m.carrying = null; S.replies++; if (meeting) S.meetings++;
        ping(ST.board.front, "check"); glow.board = 1;
        log("inbox", "done", meeting ? "positive reply, meeting booked" : "reply logged to outcomes");
      }),
      walk(m.home), set({ facing: 1 })
    );
  }

  function strategistReads() {
    const m = crew.strategist;
    if (busy(m)) { nextStrat = clock + 4; return; }
    const n = S.m + S.f;
    m.queue.push(walk(ST.board.front), wait(2, "read"), call(() => {
      glow.board = 1;
      if (n < 50) log("strategist", "done", `n=${n}, below 50: no conclusions`);
      else log("strategist", "done", `n=${n}: booking-gap factor predicts replies, proposal drafted`);
    }));
    if (n >= 50 && !S.proposal) {
      S.proposal = "carried";
      let okT = 0;
      m.queue.push(
        set({ carrying: "proposal" }),
        walk(STRAT_FRONT),
        call(() => { glow.pitwall = 1; okT = 0; }),
        until(() => { if (S.halted) { okT = 0; return false; } return okT >= 1.4; }, () => (S.halted ? "halt" : "wait")),
        call(() => {
          crew.eris.bubble = "ok"; setTimeout(() => { if (crew.eris.bubble === "ok") crew.eris.bubble = null; }, 1000);
          ping(ST.pitwallEris.seat, "check"); S.proposal = "approved";
          log("eris", "done", "weight change approved, applies to config.yaml");
        }),
        walk(PROSPECTOR_HANDOFF),
        call(() => { m.carrying = null; glow.prospector = 1; S.proposal = null; log("prospector", "done", "config.yaml weights applied, dry run clean"); }),
        walk(m.home), set({ facing: 1 })
      );
      m.approvalTick = (dt) => { const t = m.queue[0]; if (t && t.type === "until" && !S.halted) okT += dt; };
    } else {
      m.queue.push(walk(m.home), set({ facing: 1 }));
    }
  }

  const DISPATCH_TARGETS = [["prospector", ST.prospector.desk], ["writer", ST.writer.desk], ["strategist", ST.strategist.desk], ["tower", ST.tower.guardian], ["radio", ST.radio.front], ["board", ST.board.front]];
  function mcDispatch() {
    const [key, tile] = DISPATCH_TARGETS[Math.floor(Math.random() * DISPATCH_TARGETS.length)];
    ping(tile, "dispatch"); glow[key] = 1; glow.pitwall = Math.max(glow.pitwall, 0.6);
    dispatchCount++;
    if (dispatchCount % 4 === 1) log("mission-control", "running", `dispatch → ${key}, by priority`);
  }

  function guardianCheck() {
    S.towerStatus = "checking"; S.checking = 1;
    S.bounce = S.bounceSpike ? Math.min(4.2, S.bounce + 0.9) : Math.min(2.0, Math.max(0.3, S.bounce + (Math.random() - 0.5) * 0.4));
    glow.tower = 1; ping(ST.tower.guardian, "check");
    if (S.bounce >= 3 && !S.halted) halt();
    else if (!S.halted) log("guardian", "done", `bounce ${S.bounce.toFixed(1)}%, sends ${S.sends}/60, footer ok`);
  }

  function halt() {
    S.halted = true; S.towerStatus = "red";
    log("guardian", "halted", `bounce ${S.bounce.toFixed(1)}% ≥ 3% on mailbox 1: outbound_halt=true`);
    log("mission-control", "running", "red flag respected, drafting continues, sends frozen");
    crew.eris.bubble = "halt";
    setFlag();
  }
  function clearHalt() {
    if (!S.halted) return;
    S.halted = false; S.bounceSpike = false; S.bounce = 0.8; S.lightsOut = 1; S.towerStatus = "ok";
    crew.eris.bubble = null;
    log("eris", "done", "green flag: halt cleared, sends resume");
    setFlag();
  }
  const flagEl = $("flag"), flagText = $("flagText"), btnClear = $("btnClear"), stageEl = $("stage");
  function setFlag() {
    flagEl.classList.toggle("halt", S.halted);
    stageEl.classList.toggle("halted", S.halted);
    flagText.textContent = `outbound_halt = ${S.halted}`;
    btnClear.hidden = !S.halted;
  }

  /* ---------- tick ---------- */
  function tick(dt) {
    clock += dt;
    // lap / car
    if (S.carT >= 0) { S.carT += dt / LAP_S; if (S.carT >= 1) { S.carT = -1; S.lap++; S.lapGap = LAP_GAP_S; } }
    else { S.lapGap = (S.lapGap === undefined ? 2 : S.lapGap) - dt; if (S.lapGap <= 0) S.carT = 0; }
    if (S.lightsOut > 0) S.lightsOut = Math.max(0, S.lightsOut - dt / 2.6);
    if (S.checking > 0) { S.checking -= dt; if (S.checking <= 0 && S.towerStatus === "checking") S.towerStatus = "ok"; }
    // schedule
    if (clock >= nextLead) { spawnLead(); nextLead = clock + 1 + Math.random(); }
    if (clock >= nextProspectorRun) { prospectorDelivers(); nextProspectorRun = clock + 6; }
    writerDrafts();
    if (!S.halted) { runnerHandoff(); runnerReplies(); }
    for (let i = replyAt.length - 1; i >= 0; i--) if (clock >= replyAt[i]) { replyAt.splice(i, 1); S.pendingReplies++; ping(ST.radio.front, "recv"); glow.radio = 1; }
    if (clock >= nextDispatch) { mcDispatch(); nextDispatch = clock + 2.2 + Math.random() * 1.5; }
    if (clock >= nextStrat) { strategistReads(); nextStrat = clock + 16; }
    if (clock >= guardianAt) { guardianCheck(); guardianAt = clock + 7; }
    // crew
    for (const m of ALL) {
      if (S.halted && m.id === "radio") { m.walking = false; continue; } // outbound frozen
      if (m.approvalTick) m.approvalTick(dt);
      stepMember(m, dt);
      m.bob += dt;
    }
    for (let i = pings.length - 1; i >= 0; i--) { pings[i].t += dt / 1.2; if (pings[i].t >= 1) pings.splice(i, 1); }
    for (const k in glow) glow[k] = Math.max(0, glow[k] - dt * 0.9);
  }

  /* ---------- rail ---------- */
  function rail() {
    $("kLeads").textContent = S.leads;
    $("kUsable").textContent = S.usable + "%"; $("kUsable").className = "v" + (S.usable < 70 && S.leads > 8 ? " warn" : "");
    $("mUsable").querySelector("i").style.width = S.usable + "%"; $("mUsable").className = "meter" + (S.usable >= 70 ? " green" : "");
    $("kSends").textContent = S.sends; $("mSends").querySelector("i").style.width = Math.min(100, S.sends / 60 * 100) + "%";
    $("kBounce").textContent = S.bounce.toFixed(1) + "%"; $("kBounce").className = "v" + (S.bounce >= 3 ? " bad" : S.bounce >= 2 ? " warn" : "");
    $("mBounce").querySelector("i").style.width = Math.min(100, S.bounce / 3 * 100) + "%"; $("mBounce").className = "meter" + (S.bounce >= 3 ? " red" : "");
    $("kReplies").textContent = S.replies; $("kMeetings").textContent = S.meetings;
    $("cM").textContent = S.m; $("cF").textContent = S.f;
    $("bM").style.width = Math.min(100, S.m / 200 * 100) + "%"; $("bF").style.width = Math.min(100, S.f / 200 * 100) + "%";
    const n = S.m + S.f;
    $("verdict").innerHTML = n < 50 ? `<b>Strategist:</b> insufficient data (n=${n}), keep sending.`
      : (S.m >= 200 || S.f >= 200) ? `<b>Strategist:</b> ${S.m >= S.f ? "motorsport" : "freight"} leads on replies. Proposal sent to the pit wall.`
      : `<b>Strategist:</b> n=${n}. Reply-rate gap not decisive yet, keep sending.`;
    $("lap").textContent = String(S.lap).padStart(2, "0");
  }

  /* ---------- controls ---------- */
  $("btnPause").addEventListener("click", (e) => { S.paused = !S.paused; e.currentTarget.textContent = S.paused ? "Resume" : "Pause"; });
  $("btnSpeed").addEventListener("click", (e) => { S.speed = S.speed === 1 ? 2 : S.speed === 2 ? 0.5 : 1; e.currentTarget.textContent = `Speed ${S.speed}×`; });
  $("btnBounce").addEventListener("click", () => { if (S.halted) return; S.bounceSpike = true; log("guardian", "running", "bounce climbing on mailbox 1, watching threshold"); });
  btnClear.addEventListener("click", clearHalt);

  /* ---------- view + loop ---------- */
  function view() {
    return {
      halted: S.halted, lightsOut: S.lightsOut, lap: S.lap, carT: S.carT,
      crew: ALL.map((m) => ({ id: m.id, c: m.c, r: m.r, color: m.color, facing: m.facing, walking: m.walking, frame: m.frame, carrying: m.carrying, bubble: m.bubble, seated: m.seated })),
      pings: pings.map((p) => ({ c: p.c, r: p.r, kind: p.kind, t: p.t })),
      stationGlow: Object.assign({}, glow),
      tower: { status: S.towerStatus },
      board: { replies: S.replies, meetings: S.meetings, closes: S.closes },
    };
  }
  P.init($("world"), $("hud"));
  P.resize();
  window.addEventListener("resize", () => P.resize());
  log("mission-control", "running", "pass started: reading state, guardian first");
  log("guardian", "done", "bounce 0.6%, suppressions clean, footer present");
  log("prospector", "running", "cohort motorsport: discover → enrich → score");
  let last = performance.now(), acc = 0;
  function loop(now) {
    let dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!Number.isFinite(dt) || dt < 0) dt = 0;
    if (!S.paused) { tick(dt * S.speed); acc += dt; if (acc > 0.25) { rail(); acc = 0; } }
    P.render(view(), now / 1000);
    requestAnimationFrame(loop);
  }
  rail();
  requestAnimationFrame(loop);
  window.__paddockSim = { S, crew, log };
})();
