import { initials } from "./url";

// Tinted initials, the mock's .av: a quiet colour per person so a list scans by face, not by text.
const TINTS = [
  ["rgba(240,125,26,0.16)", "#ffb36b"],
  ["rgba(143,220,154,0.13)", "#8fdc9a"],
  ["rgba(140,170,255,0.14)", "#b4c6ff"],
  ["rgba(255,138,122,0.14)", "#ff8a7a"],
  ["rgba(198,204,211,0.12)", "#c6ccd3"],
  ["rgba(240,196,25,0.13)", "#f0c419"],
];

function tint(seed: string) {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TINTS[h % TINTS.length];
}

export default function Avatar({ name, seed, size = 40 }: { name: string; seed?: string; size?: number }) {
  const [bg, fg] = tint((seed ?? name).toLowerCase());
  return (
    <span
      aria-hidden="true"
      className="grid shrink-0 place-items-center rounded-full font-semibold"
      style={{ width: size, height: size, background: bg, color: fg, fontSize: Math.round(size * 0.36) }}
    >
      {initials(name)}
    </span>
  );
}
