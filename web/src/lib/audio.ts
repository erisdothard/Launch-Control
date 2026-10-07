/*
  Engine audio. WebAudio loop pitched to rpm.
  - Never autoplays: the AudioContext is created on the start press (a user gesture).
  - Muted by default on touch devices. HUD toggle flips it.
  - Sample: /audio/v8-loop-v1.mp3 (see public/audio/CREDITS.md). If it cannot load or decode,
    an oscillator-bank + noise stand-in is synthesised so the engine always has a voice.
*/

import { ENGINE_GEOMETRY } from "./engine/engineContract";

const SAMPLE_URL = "/audio/v8-loop-v1.mp3";
/** rpm the sample was recorded / synthesised at */
const SAMPLE_RPM = ENGINE_GEOMETRY.idleRpm;

export function isTouchDevice(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
}

type Voice =
  | { kind: "sample"; source: AudioBufferSourceNode }
  | { kind: "synth"; oscs: OscillatorNode[]; noise: AudioBufferSourceNode; filter: BiquadFilterNode };

class EngineAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private level: GainNode | null = null;
  private voice: Voice | null = null;
  private _muted = false;
  private unlocking: Promise<void> | null = null;
  private listeners = new Set<() => void>();

  get muted() {
    return this._muted;
  }

  get unlocked() {
    return this.ctx !== null && this.voice !== null;
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    for (const l of this.listeners) l();
  }

  /** Call from a user gesture. Safe to call repeatedly. */
  unlock(): Promise<void> {
    if (this.unlocking) return this.unlocking;
    this.unlocking = this.doUnlock().catch(() => {
      /* audio is optional; failure leaves the engine silent */
    });
    return this.unlocking;
  }

  private async doUnlock() {
    if (typeof window === "undefined") return;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    this._muted = isTouchDevice();
    const ctx = new Ctx();
    this.ctx = ctx;
    await ctx.resume();
    const master = ctx.createGain();
    master.gain.value = this._muted ? 0 : 1;
    master.connect(ctx.destination);
    const level = ctx.createGain();
    level.gain.value = 0;
    level.connect(master);
    this.master = master;
    this.level = level;

    const buffer = await this.loadSample(ctx);
    this.voice = buffer ? this.startSample(ctx, buffer, level) : this.startSynth(ctx, level);
    this.emit();
  }

  private async loadSample(ctx: AudioContext): Promise<AudioBuffer | null> {
    try {
      const res = await fetch(SAMPLE_URL);
      if (!res.ok) return null;
      const bytes = await res.arrayBuffer();
      return await ctx.decodeAudioData(bytes);
    } catch {
      return null;
    }
  }

  private startSample(ctx: AudioContext, buffer: AudioBuffer, out: GainNode): Voice {
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.playbackRate.value = 0.01;
    source.connect(out);
    source.start();
    return { kind: "sample", source };
  }

  private startSynth(ctx: AudioContext, out: GainNode): Voice {
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 400;
    filter.Q.value = 2;
    filter.connect(out);

    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = (i / 128) - 1;
      curve[i] = Math.tanh(x * 3);
    }
    shaper.curve = curve;
    shaper.connect(filter);

    // Firing fundamental (4 fires per rev on a V8), crank sub, and an octave for bite.
    const ratios = [1, 0.5, 2];
    const oscs = ratios.map((ratio, i) => {
      const o = ctx.createOscillator();
      o.type = i === 1 ? "triangle" : "sawtooth";
      o.frequency.value = 1;
      const g = ctx.createGain();
      g.gain.value = [0.5, 0.35, 0.18][i];
      o.connect(g);
      g.connect(shaper);
      o.start();
      return o;
    });
    void ratios;

    const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;
    noise.loop = true;
    const ng = ctx.createGain();
    ng.gain.value = 0.12;
    noise.connect(ng);
    ng.connect(shaper);
    noise.start();

    return { kind: "synth", oscs, noise, filter };
  }

  /** Called every frame from the loop. Cheap: parameter automation only. */
  setRpm(rpm: number) {
    const ctx = this.ctx;
    const v = this.voice;
    const level = this.level;
    if (!ctx || !v || !level) return;
    const t = ctx.currentTime;
    const norm = rpm / ENGINE_GEOMETRY.limiterRpm;
    const gain = rpm <= 0 ? 0 : 0.22 + 0.5 * norm;
    level.gain.setTargetAtTime(gain, t, 0.05);
    if (v.kind === "sample") {
      // Sub-linear pitch: the idle sample at 2200 rpm plays at ~1.75x, not 2.75x. It rises, never screams.
      const rate = Math.max(0.05, Math.pow(rpm / SAMPLE_RPM, 0.55));
      v.source.playbackRate.setTargetAtTime(rate, t, 0.04);
    } else {
      const fire = Math.max(2, (rpm / 60) * 4);
      const ratios = [1, 0.5, 2];
      v.oscs.forEach((o, i) => o.frequency.setTargetAtTime(fire * ratios[i], t, 0.04));
      v.filter.frequency.setTargetAtTime(200 + rpm * 0.5, t, 0.05);
    }
  }

  setMuted(m: boolean) {
    this._muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.03);
    this.emit();
  }

  toggle() {
    this.setMuted(!this._muted);
  }

  dispose() {
    try {
      this.ctx?.close();
    } catch {
      /* already closed */
    }
    this.ctx = null;
    this.voice = null;
    this.master = null;
    this.level = null;
    this.unlocking = null;
  }
}

export const engineAudio = new EngineAudio();
