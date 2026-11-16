/*
  Plan Z demo state. Everything is example data seeded from src/content/planz.ts and kept in memory:
  dates are whole-day offsets from the day the page opened (0 = today), so deadlines always land
  around "now". The reducer is the only writer; views read through the selectors below.
*/

import { planz, type SeatStatus, type Series, type Stage } from "@/content/planz";

export type Channel = "Email" | "Call" | "Text" | "Form" | "Payment";

export interface Comm {
  day: number;
  channel: Channel;
  who: string;
  text: string;
}

export interface Driver {
  id: string;
  name: string;
  email: string;
  phone: string;
  city: string;
  experience: string;
  source: string;
  owner: string;
  interests: string;
  notes: string;
  stage: Stage;
  comms: Comm[];
  isNew?: boolean;
}

export interface Seat {
  driverId: string | null;
  status: SeatStatus;
  reminded?: boolean;
}

export interface RaceEvent {
  id: string;
  start: number;
  track: string;
  city: string;
  series: Series;
  cars: string[];
  backup: string;
  seats: Record<string, Seat[]>;
  waitlist: string[];
}

export interface FollowUp {
  id: string;
  day: number;
  driverId: string;
  eventId?: string;
  sequence: string;
  step: string;
  state: "queued" | "sent" | "skipped";
}

export interface DemoState {
  drivers: Driver[];
  events: RaceEvent[];
  followUps: FollowUp[];
  sequencesOn: Record<string, boolean>;
  highlight?: string;
}

const P = planz.pricing;
const CODE: Record<string, SeatStatus> = { o: "open", i: "interested", c: "committed", d: "deposit", b: "balance", p: "paid" };
const SEATED = 24;

export const depositDue = (ev: RaceEvent): number => ev.start - P.depositDaysBefore;
export const balanceDue = (ev: RaceEvent): number => ev.start + 1 + P.balanceDaysAfter;
export const isPast = (ev: RaceEvent): boolean => ev.start + 1 < 0;
export const committedStatuses: SeatStatus[] = ["committed", "deposit", "balance", "paid"];

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z]+/g, ".").replace(/^\.|\.$/g, "");
}

function phone(i: number): string {
  return `(404) 555-${String(1100 + i * 37).slice(-4)}`;
}

function seedEvents(): RaceEvent[] {
  return planz.events.map(([start, track, city, series, cars], e) => {
    const backup = planz.cars.find((c) => !cars.includes(c.id))?.id ?? "";
    let n = 0;
    const seats: Record<string, Seat[]> = {};
    cars.forEach((car, ci) => {
      seats[car] = [...(planz.seatPlan[e]?.[ci] ?? "oooo")].map((code) => {
        const status = CODE[code] ?? "open";
        if (status === "open") return { driverId: null, status };
        const idx = (e * 5 + n++) % SEATED;
        return { driverId: `d${idx}`, status };
      });
    });
    const waitlist = e === 1 ? ["d30"] : [];
    return { id: `e${e}`, start, track, city, series, cars: [...cars], backup, seats, waitlist };
  });
}

function seatsOf(events: RaceEvent[], driverId: string): { ev: RaceEvent; seat: Seat }[] {
  return events.flatMap((ev) =>
    Object.values(ev.seats).flatMap((list) => list.filter((s) => s.driverId === driverId).map((seat) => ({ ev, seat })))
  );
}

function stageFor(events: RaceEvent[], driverId: string, fallback: Stage): Stage {
  const upcoming = seatsOf(events, driverId).filter(({ ev }) => !isPast(ev));
  if (upcoming.some(({ seat }) => committedStatuses.includes(seat.status))) return "confirmed";
  if (upcoming.some(({ seat }) => seat.status === "interested")) return "pending";
  return fallback;
}

function seedComms(d: Omit<Driver, "comms">, stageIdx: number, i: number): Comm[] {
  const first = -30 - (i % 7) * 4;
  const viaMax = d.owner === planz.brand.bizdev;
  const log: Comm[] = [
    d.source === "Website form"
      ? { day: first, channel: "Form", who: d.name, text: "Seat inquiry from planzracing.com." }
      : viaMax
        ? { day: first, channel: "Email", who: "Max", text: "First note: open seats on the race calendar." }
        : { day: first, channel: "Call", who: "Jim", text: `${d.source}: intro call.` },
  ];
  if (stageIdx >= 1) log.push({ day: first + 2, channel: "Call", who: "Max", text: "Talked through how arrive and drive works." });
  if (stageIdx >= 2) log.push({ day: first + 5, channel: "Email", who: "Max", text: "Qualified: experience and reference laps checked." });
  if (stageIdx >= 3) log.push({ day: first + 8, channel: "Email", who: "Jim", text: "Approved to drive." });
  if (stageIdx >= 4) log.push({ day: first + 12, channel: "Email", who: "System", text: "Contract and waiver sent." });
  if (stageIdx >= 5) log.push({ day: first + 16, channel: "Payment", who: "System", text: "Deposit received." });
  return log.filter((c) => c.day < 0).reverse();
}

function seedDrivers(events: RaceEvent[]): Driver[] {
  const order = planz.stages.map((s) => s.id);
  return planz.drivers.map(([name, city, experience, source, owner, interests, notes], i) => {
    const id = `d${i}`;
    const fallback: Stage = i < SEATED ? "approved" : (planz.prospectStages[i - SEATED] ?? "inquiry");
    const stage = stageFor(events, id, fallback);
    const base = { id, name, email: `${slug(name)}@example.com`, phone: phone(i), city, experience, source, owner, interests, notes, stage };
    return { ...base, comms: seedComms(base, order.indexOf(stage), i) };
  });
}

/** The next step of each running sequence, from seat statuses and pipeline stages. */
function seedFollowUps(events: RaceEvent[], drivers: Driver[]): FollowUp[] {
  const out: FollowUp[] = [];
  const add = (f: Omit<FollowUp, "id" | "state">) => out.push({ ...f, id: `f${out.length}`, state: "queued" });
  const [hold, deposit, balance, welcome] = ["hold", "deposit", "balance", "welcome"].map((id) => planz.sequences.find((s) => s.id === id)!);
  for (const ev of events) {
    for (const seat of Object.values(ev.seats).flat()) {
      if (!seat.driverId) continue;
      const base = { driverId: seat.driverId, eventId: ev.id };
      if (seat.status === "interested") {
        const marks = [60, 45, 35].map((d) => ev.start - d);
        const k = marks.findIndex((m) => m >= 0);
        if (k >= 0 && marks[k] <= 21) add({ ...base, day: marks[k], sequence: hold.name, step: hold.steps[k] ?? "" });
      } else if (seat.status === "committed") {
        const marks = [37, 33, 30].map((d) => ev.start - d);
        const k = marks.findIndex((m) => m >= 0);
        if (k < 0) add({ ...base, day: 0, sequence: deposit.name, step: deposit.steps[2] ?? "" });
        else if (marks[k] <= 21) add({ ...base, day: marks[k], sequence: deposit.name, step: deposit.steps[k] ?? "" });
      } else if (seat.status === "balance") {
        const marks = [1, 5, 7].map((d) => ev.start + 1 + d);
        const k = marks.findIndex((m) => m >= 0);
        add({ ...base, day: k < 0 ? 0 : marks[k], sequence: balance.name, step: balance.steps[k < 0 ? 2 : k] ?? "" });
      }
    }
  }
  for (const d of drivers) {
    if (d.stage === "inquiry") add({ driverId: d.id, day: 1, sequence: welcome.name, step: welcome.steps[2] ?? "" });
    if (d.stage === "contacted") add({ driverId: d.id, day: 0, sequence: welcome.name, step: welcome.steps[1] ?? "" });
    if (d.stage === "qualified") add({ driverId: d.id, day: 2, sequence: welcome.name, step: welcome.steps[3] ?? "" });
  }
  return out.sort((a, b) => a.day - b.day);
}

export function seed(): DemoState {
  const events = seedEvents();
  const drivers = seedDrivers(events);
  return {
    drivers,
    events,
    followUps: seedFollowUps(events, drivers),
    sequencesOn: Object.fromEntries(planz.sequences.map((s) => [s.id, true])),
  };
}

// --- actions -------------------------------------------------------------------------------------

export interface InquiryInput {
  name: string;
  email: string;
  phone: string;
  experience: string;
  car: string;
  series: string;
  eventId: string;
  message: string;
}

export type Action =
  | { type: "seat"; eventId: string; car: string; idx: number; status: SeatStatus; driverId?: string | null }
  | { type: "remind"; eventId: string; car: string; idx: number }
  | { type: "stage"; driverId: string; stage: Stage }
  | { type: "followUp"; id: string; state: "sent" | "skipped" }
  | { type: "sequence"; id: string; on: boolean }
  | { type: "call"; driverId: string }
  | { type: "inquiry"; input: InquiryInput; id: string }
  | { type: "reset" };

function logTo(drivers: Driver[], id: string, comm: Comm): Driver[] {
  return drivers.map((d) => (d.id === id ? { ...d, comms: [comm, ...d.comms] } : d));
}

function withSeat(events: RaceEvent[], eventId: string, car: string, idx: number, patch: Partial<Seat>): RaceEvent[] {
  return events.map((ev) =>
    ev.id !== eventId ? ev : { ...ev, seats: { ...ev.seats, [car]: ev.seats[car].map((s, i) => (i === idx ? { ...s, ...patch } : s)) } }
  );
}

const SEAT_LOG: Partial<Record<SeatStatus, [Channel, string]>> = {
  interested: ["Email", "Seat held. Hold sequence started."],
  committed: ["Email", "Committed. Contract and waiver sent; deposit sequence started."],
  deposit: ["Payment", "Deposit received."],
  paid: ["Payment", "Balance received. Paid in full."],
};

export function reducer(state: DemoState, a: Action): DemoState {
  switch (a.type) {
    case "seat": {
      const ev = state.events.find((e) => e.id === a.eventId);
      const prev = ev?.seats[a.car]?.[a.idx];
      if (!ev || !prev) return state;
      const driverId = a.driverId === undefined ? prev.driverId : a.driverId;
      const status = driverId ? a.status : "open";
      let drivers = state.drivers;
      const log = SEAT_LOG[status];
      if (driverId && log) drivers = logTo(drivers, driverId, { day: 0, channel: log[0], who: "System", text: `${ev.track}: ${log[1]}` });
      const events = withSeat(state.events, a.eventId, a.car, a.idx, { driverId, status, reminded: false });
      const touched = [driverId, prev.driverId].filter((x): x is string => Boolean(x));
      drivers = drivers.map((d) => (touched.includes(d.id) ? { ...d, stage: stageFor(events, d.id, d.stage === "confirmed" || d.stage === "pending" ? "approved" : d.stage) } : d));
      return { ...state, events, drivers };
    }
    case "remind": {
      const ev = state.events.find((e) => e.id === a.eventId);
      const seat = ev?.seats[a.car]?.[a.idx];
      if (!ev || !seat?.driverId) return state;
      const what = seat.status === "balance" ? "Balance reminder" : seat.status === "committed" ? "Deposit reminder" : "Seat reminder";
      return {
        ...state,
        events: withSeat(state.events, a.eventId, a.car, a.idx, { reminded: true }),
        drivers: logTo(state.drivers, seat.driverId, { day: 0, channel: "Email", who: "System", text: `${what} for ${ev.track}.` }),
      };
    }
    case "stage":
      return { ...state, drivers: state.drivers.map((d) => (d.id === a.driverId ? { ...d, stage: a.stage, isNew: false } : d)) };
    case "followUp": {
      const f = state.followUps.find((x) => x.id === a.id);
      if (!f) return state;
      const followUps = state.followUps.map((x) => (x.id === a.id ? { ...x, state: a.state } : x));
      const drivers = a.state === "sent" ? logTo(state.drivers, f.driverId, { day: 0, channel: "Email", who: "System", text: `${f.sequence}: ${f.step}` }) : state.drivers;
      return { ...state, followUps, drivers };
    }
    case "sequence":
      return { ...state, sequencesOn: { ...state.sequencesOn, [a.id]: a.on } };
    case "call":
      return { ...state, drivers: logTo(state.drivers, a.driverId, { day: 0, channel: "Call", who: "Max", text: planz.copy.driver.callLogged }) };
    case "inquiry": {
      const { input } = a;
      const ev = state.events.find((e) => e.id === input.eventId);
      const welcome = planz.sequences.find((s) => s.id === "welcome")!;
      const driver: Driver = {
        id: a.id, name: input.name, email: input.email, phone: input.phone, city: "", experience: input.experience,
        source: "Website form", owner: planz.brand.bizdev, interests: [input.car, input.series, ev?.track].filter(Boolean).join(" · "),
        notes: input.message, stage: "inquiry", isNew: true,
        comms: [
          { day: 0, channel: "Email", who: "System", text: `${welcome.name}: ${welcome.steps[0]}` },
          { day: 0, channel: "Form", who: input.name, text: `Seat inquiry${ev ? ` for ${ev.track}` : ""}.` },
        ],
      };
      const task: FollowUp = { id: `f-${a.id}`, day: 0, driverId: a.id, eventId: ev?.id, sequence: welcome.name, step: welcome.steps[1], state: "queued" };
      return { ...state, drivers: [driver, ...state.drivers], followUps: [task, ...state.followUps], highlight: a.id };
    }
    case "reset":
      return seed();
  }
}

// --- selectors -----------------------------------------------------------------------------------

export function allSeats(ev: RaceEvent): Seat[] {
  return ev.cars.flatMap((c) => ev.seats[c] ?? []);
}

export function seatCounts(ev: RaceEvent) {
  const seats = allSeats(ev);
  const by = (s: SeatStatus) => seats.filter((x) => x.status === s).length;
  return {
    total: seats.length,
    committed: seats.filter((s) => committedStatuses.includes(s.status)).length,
    interested: by("interested"),
    open: by("open"),
  };
}

export interface PaymentRow {
  ev: RaceEvent;
  driver: Driver;
  car: string;
  idx: number;
  status: SeatStatus;
  amount: number;
  due: number;
}

export function payments(state: DemoState): PaymentRow[] {
  const byId = new Map(state.drivers.map((d) => [d.id, d]));
  const rows: PaymentRow[] = [];
  for (const ev of state.events) {
    for (const car of ev.cars) {
      ev.seats[car].forEach((s, idx) => {
        const driver = s.driverId ? byId.get(s.driverId) : undefined;
        if (!driver) return;
        if (s.status === "committed") rows.push({ ev, driver, car, idx, status: s.status, amount: P.deposit, due: depositDue(ev) });
        if (s.status === "deposit") rows.push({ ev, driver, car, idx, status: s.status, amount: P.seat - P.deposit, due: balanceDue(ev) });
        if (s.status === "balance") rows.push({ ev, driver, car, idx, status: s.status, amount: P.seat - P.deposit, due: balanceDue(ev) });
        if (s.status === "paid") rows.push({ ev, driver, car, idx, status: s.status, amount: 0, due: balanceDue(ev) });
      });
    }
  }
  return rows.sort((a, b) => a.due - b.due);
}

export function moneyTotals(state: DemoState) {
  const rows = payments(state);
  const sum = (f: (r: PaymentRow) => number) => rows.reduce((t, r) => t + f(r), 0);
  return {
    depositsOut: sum((r) => (r.status === "committed" ? r.amount : 0)),
    depositsOutCount: rows.filter((r) => r.status === "committed").length,
    balancesOut: sum((r) => (r.status === "balance" ? r.amount : 0)),
    collected: sum((r) => (r.status === "paid" ? P.seat : r.status === "deposit" || r.status === "balance" ? P.deposit : 0)),
  };
}

export interface Attention {
  driver: Driver;
  reason: string;
  day: number;
  eventId?: string;
}

/** Who needs a person: overdue money, seats held close to the race, inquiries nobody has called. */
export function needsAttention(state: DemoState): Attention[] {
  const out: Attention[] = [];
  const byId = new Map(state.drivers.map((d) => [d.id, d]));
  for (const ev of state.events) {
    for (const s of allSeats(ev)) {
      const d = s.driverId ? byId.get(s.driverId) : undefined;
      if (!d) continue;
      if (s.status === "committed" && depositDue(ev) <= 7) out.push({ driver: d, reason: `Deposit · ${ev.track}`, day: depositDue(ev), eventId: ev.id });
      if (s.status === "balance") out.push({ driver: d, reason: `Balance · ${ev.track}`, day: balanceDue(ev), eventId: ev.id });
      if (s.status === "interested" && ev.start - 45 <= 0 && !isPast(ev)) out.push({ driver: d, reason: `Seat held, not committed · ${ev.track}`, day: ev.start - 35, eventId: ev.id });
    }
  }
  for (const d of state.drivers) if (d.stage === "inquiry") out.push({ driver: d, reason: "New inquiry, not contacted yet", day: 0 });
  return out.sort((a, b) => a.day - b.day);
}

// --- formatting ----------------------------------------------------------------------------------

export function dateOf(offset: number, base: Date): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + offset);
  return d;
}

export function fmtDay(offset: number, base: Date): string {
  return dateOf(offset, base).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function fmtWeekend(start: number, base: Date): string {
  const a = dateOf(start, base);
  const b = dateOf(start + 1, base);
  const m = (d: Date) => d.toLocaleDateString("en-US", { month: "short" });
  return m(a) === m(b) ? `${m(a)} ${a.getDate()}–${b.getDate()}` : `${m(a)} ${a.getDate()} – ${m(b)} ${b.getDate()}`;
}

export function fmtMoney(n: number): string {
  return `$${n.toLocaleString("en-US")}`;
}

export function carById(id: string) {
  return planz.cars.find((c) => c.id === id);
}
