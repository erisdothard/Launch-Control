/** A .glsl file holds vertex and fragment stages separated by this marker line. */
const MARKER = "// --- fragment ---";

export type ShaderPair = { vertex: string; fragment: string };

export function splitShader(source: string): ShaderPair {
  const at = source.indexOf(MARKER);
  if (at < 0) throw new Error("splitShader: missing '// --- fragment ---' marker");
  return { vertex: source.slice(0, at), fragment: source.slice(at + MARKER.length) };
}
