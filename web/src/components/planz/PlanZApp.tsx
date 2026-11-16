"use client";

/* The Plan Z demo app: sidebar, the current view (kept in the URL hash so a view can be linked),
   and the driver drawer. Rendered client-only so every date is counted from the viewer's today. */

import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { planz } from "@/content/planz";
import { needsAttention, reducer, seed } from "./state";
import { Ctx, type View } from "./ui";
import { Dashboard } from "./Dashboard";
import { Calendar, EventView } from "./RaceViews";
import { DriverDrawer, Drivers, Pipeline } from "./PeopleViews";
import { FollowUps, Payments } from "./MoneyViews";
import { InquiryForm } from "./InquiryForm";
import s from "./shell.module.css";

const VIEWS = Object.keys(planz.copy.nav) as View[];

function readHash(): { view: View; eventId: string } {
  const [view, eventId = ""] = window.location.hash.replace(/^#/, "").split("/");
  return { view: VIEWS.includes(view as View) ? (view as View) : "dashboard", eventId };
}

export default function PlanZApp() {
  const [state, dispatch] = useReducer(reducer, undefined, seed);
  const base = useMemo(() => {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    return d;
  }, []);
  const [{ view, eventId }, setRoute] = useState(readHash);
  const [driverId, setDriverId] = useState<string | null>(null);

  useEffect(() => {
    const onHash = () => setRoute(readHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const go = useCallback((next: View, ev?: string) => {
    const hash = ev ? `#${next}/${ev}` : `#${next}`;
    window.history.pushState(null, "", hash);
    setRoute({ view: next, eventId: ev ?? "" });
    window.scrollTo({ top: 0 });
  }, []);
  const closeDriver = useCallback(() => setDriverId(null), []);

  const attention = needsAttention(state).length;
  const queued = state.followUps.filter((f) => f.state === "queued" && f.day <= 0).length;
  const counts: Partial<Record<View, number>> = { dashboard: attention, followups: queued };

  return (
    <Ctx.Provider value={{ state, dispatch, base, go, openDriver: setDriverId, eventId }}>
      <div className={s.root}>
        <aside className={s.side}>
          <div className={s.brand}>
            {/* eslint-disable-next-line @next/next/no-img-element -- small static logo */}
            <img src={planz.brand.logo} alt="" width={46} height={46} />
            <div>
              <div className={s.brandName}>{planz.brand.name}</div>
              <div className={s.brandSub}>{planz.brand.owner}</div>
            </div>
          </div>
          <nav className={s.nav} aria-label={planz.brand.name}>
            {VIEWS.map((id) => (
              <button key={id} className={s.navBtn} aria-current={view === id ? "page" : undefined} onClick={() => go(id)}>
                <span>{planz.copy.nav[id]}</span>
                {counts[id] ? <span className={s.navCount}>{counts[id]}</span> : null}
              </button>
            ))}
          </nav>
          <div className={s.sideFoot}>
            <span className={s.badge}>{planz.brand.exampleBadge}</span>
            <span>{planz.copy.common.exampleNote}</span>
            <button className={s.linkBtn} onClick={() => dispatch({ type: "reset" })}>{planz.copy.common.reset}</button>
            <span>{planz.brand.builtBy}</span>
          </div>
        </aside>
        <main className={s.main}>
          {view === "dashboard" && <Dashboard />}
          {view === "calendar" && <Calendar />}
          {view === "event" && <EventView />}
          {view === "drivers" && <Drivers />}
          {view === "pipeline" && <Pipeline />}
          {view === "payments" && <Payments />}
          {view === "followups" && <FollowUps />}
          {view === "form" && <InquiryForm />}
        </main>
        {driverId && <DriverDrawer id={driverId} onClose={closeDriver} />}
      </div>
    </Ctx.Provider>
  );
}
