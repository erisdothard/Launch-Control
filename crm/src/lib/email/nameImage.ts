import "server-only";
import satori from "satori";
import type { ReactNode } from "react";
import { Resvg } from "@resvg/resvg-js";
import { MICHROMA_TTF_BASE64 } from "./michromaData";

// The signature name as a PNG set in Michroma, the wordmark face. Web fonts never reach Gmail or
// Outlook for Windows, so the name travels as an inline image instead, like the logo. Drawn at 2x
// for sharp screens; the HTML shows it at half size (NAME_IMAGE_HEIGHT tall).

/** The name's height in the email, in CSS px. */
export const NAME_IMAGE_HEIGHT = 17;
const SCALE = 2;
const INK = "#050607";

export interface NameImage {
  png: Buffer;
  /** CSS px, already divided by the render scale. */
  width: number;
  height: number;
}

const font = Buffer.from(MICHROMA_TTF_BASE64, "base64");
const cache = new Map<string, Promise<NameImage>>();

async function draw(name: string): Promise<NameImage> {
  // A wide canvas, then cropped to the ink, so any name length comes out at its own width.
  // Plain element object, no JSX: satori only needs type and props.
  const element = {
    type: "div",
    props: {
      style: { display: "flex", color: INK, fontFamily: "Michroma", fontSize: NAME_IMAGE_HEIGHT * SCALE, whiteSpace: "nowrap" },
      children: name,
    },
  } as unknown as ReactNode;
  const svg = await satori(
    element,
    { width: 2400, height: NAME_IMAGE_HEIGHT * SCALE * 2, fonts: [{ name: "Michroma", data: font, weight: 400, style: "normal" }] }
  );
  const renderer = new Resvg(svg, { font: { loadSystemFonts: false } });
  const box = renderer.innerBBox() ?? renderer.getBBox();
  if (box) renderer.cropByBBox(box);
  const rendered = renderer.render();
  return { png: Buffer.from(rendered.asPng()), width: Math.ceil(rendered.width / SCALE), height: Math.ceil(rendered.height / SCALE) };
}

/** The name drawn in Michroma; the same name is drawn once per server instance. */
export function renderNameImage(name: string): Promise<NameImage> {
  const key = name.trim();
  if (!key) return Promise.reject(new Error("No name to draw"));
  let hit = cache.get(key);
  if (!hit) {
    hit = draw(key).catch((err) => {
      cache.delete(key);
      throw err;
    });
    cache.set(key, hit);
  }
  return hit;
}
