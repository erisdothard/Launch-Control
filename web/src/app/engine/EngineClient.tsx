"use client";

import dynamic from "next/dynamic";

const EngineViewer = dynamic(() => import("./EngineViewer").then((m) => m.EngineViewer), { ssr: false });

export function EngineClient() {
  return <EngineViewer />;
}
