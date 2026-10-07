"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect } from "react";
import type { Scene } from "three";
import { Effects } from "@/components/fx/Effects";
import { HEAT, type FxQuality } from "@/components/fx/fxState";
import { labClock, labState } from "./labState";
import { FIRE_DIRECTION, FIRE_ORIGIN, StandInEngine, useSampleMesh } from "./StandInEngine";

/** Writes the clock into the lab state. The real site does this from the single gsap ticker. */
function Clock() {
  useFrame(({ clock }) => {
    if (!labClock.frozen) labState.time = clock.elapsedTime;
  });
  return null;
}

/** Exposes the scene graph for Playwright inspection (dev lab only). */
function Expose() {
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    window.__labScene = scene;
    return () => {
      delete window.__labScene;
    };
  }, [scene]);
  return null;
}

declare global {
  interface Window {
    __labScene?: Scene;
  }
}

function Lab({ quality }: { quality: FxQuality }) {
  const sampleMesh = useSampleMesh();
  return (
    <>
      <Clock />
      <Expose />
      {/* Cold rim light from behind-above. The combustion is the only warm source. */}
      <ambientLight color={HEAT.steel} intensity={0.18} />
      <directionalLight position={[-4, 5, -5]} color="#9fa5ac" intensity={2.2} />
      <directionalLight position={[5, 1, 4]} color="#6e757d" intensity={0.9} />
      <StandInEngine state={labState} />
      <Effects
        state={labState}
        quality={quality}
        fireOrigin={FIRE_ORIGIN}
        fireDirection={FIRE_DIRECTION}
        fogCenter={[0, -0.6, 0.4]}
        fogRadius={2.6}
        pointsMesh={sampleMesh}
      />
    </>
  );
}

export function LabScene({ quality }: { quality: FxQuality }) {
  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ position: [4.4, 2.3, 5.4], fov: 38, near: 0.1, far: 60 }}
      gl={{ antialias: false, powerPreference: "high-performance" }}
      onCreated={({ gl }) => gl.setClearColor(HEAT.background, 1)}
      className="absolute inset-0"
    >
      <Lab quality={quality} />
    </Canvas>
  );
}
