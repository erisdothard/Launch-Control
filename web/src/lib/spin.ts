/*
  Mouse / touch drag rotates the engine about its centre. One plain mutable object: pointer
  handlers write it, the scene's useFrame reads it. Yaw keeps what you gave it (on top of the
  slow turntable), pitch eases back to level, and a flick carries inertia.
  Horizontal drags only on touch (`touch-action: pan-y` on the stage keeps vertical scroll native).
*/

export type EngineSpin = {
  yaw: number;
  pitch: number;
  vyaw: number;
  vpitch: number;
  dragging: boolean;
};

export const engineSpin: EngineSpin = { yaw: 0, pitch: 0, vyaw: 0, vpitch: 0, dragging: false };

const YAW_PER_PX = 0.0065;
const PITCH_PER_PX = 0.004;
export const PITCH_LIMIT = 0.38;

/** Attach drag-to-rotate to an element. Returns the detach function. */
export function attachSpin(el: HTMLElement): () => void {
  let lastX = 0;
  let lastY = 0;
  let lastT = 0;
  let pointerId: number | null = null;

  const down = (e: PointerEvent) => {
    if (e.button !== 0 || pointerId !== null) return;
    if ((e.target as HTMLElement | null)?.closest("a, button, input, select, textarea, label")) return;
    pointerId = e.pointerId;
    lastX = e.clientX;
    lastY = e.clientY;
    lastT = e.timeStamp;
    engineSpin.dragging = true;
    engineSpin.vyaw = 0;
    engineSpin.vpitch = 0;
    el.setPointerCapture(e.pointerId);
    el.style.cursor = "grabbing";
  };
  const move = (e: PointerEvent) => {
    if (e.pointerId !== pointerId) return;
    const dt = Math.max(1, e.timeStamp - lastT) / 1000;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    lastT = e.timeStamp;
    const dyaw = dx * YAW_PER_PX;
    const dpitch = dy * PITCH_PER_PX;
    engineSpin.yaw += dyaw;
    engineSpin.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, engineSpin.pitch + dpitch));
    engineSpin.vyaw = dyaw / dt;
    engineSpin.vpitch = dpitch / dt;
  };
  const up = (e: PointerEvent) => {
    if (e.pointerId !== pointerId) return;
    pointerId = null;
    engineSpin.dragging = false;
    el.style.cursor = "grab";
    try {
      el.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  };

  el.style.cursor = "grab";
  el.style.touchAction = "pan-y";
  el.addEventListener("pointerdown", down);
  el.addEventListener("pointermove", move);
  el.addEventListener("pointerup", up);
  el.addEventListener("pointercancel", up);
  return () => {
    el.removeEventListener("pointerdown", down);
    el.removeEventListener("pointermove", move);
    el.removeEventListener("pointerup", up);
    el.removeEventListener("pointercancel", up);
    el.style.cursor = "";
    el.style.touchAction = "";
  };
}

/** Per-frame inertia and settle. Call from the scene's useFrame with the frame delta. */
export function stepSpin(dt: number) {
  const s = engineSpin;
  if (s.dragging) return;
  s.yaw += s.vyaw * dt;
  s.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, s.pitch + s.vpitch * dt));
  const damp = Math.exp(-dt * 2.6);
  s.vyaw *= damp;
  s.vpitch *= damp;
  // pitch always levels out; yaw is yours to keep
  s.pitch += (0 - s.pitch) * (1 - Math.exp(-dt * 1.8));
}
