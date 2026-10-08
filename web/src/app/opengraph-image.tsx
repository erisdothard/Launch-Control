import { ImageResponse } from "next/og";
import { site } from "@/content/site";

/* The share card: black ground, the livery stripe, the wordmark and the headline. Colours are the
   tokens.css values written out, since this renders outside the stylesheet. */
export const alt = site.seo.title;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: "#050607",
          color: "#f4f6f8",
          fontFamily: "Helvetica, Arial, sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <div style={{ display: "flex", height: 6, width: 120 }}>
            <div style={{ flex: 5, background: "#f0c419" }} />
            <div style={{ flex: 3, background: "#f07d1a" }} />
            <div style={{ flex: 2, background: "#e3261d" }} />
          </div>
          <div style={{ fontSize: 22, letterSpacing: "0.14em", color: "#c6ccd3" }}>{site.brand.wordmark}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: 72, fontWeight: 600, lineHeight: 1.05, letterSpacing: "-0.01em", color: "#c6ccd3", maxWidth: 980 }}>
            {site.seo.ogHeadline}
          </div>
          <div style={{ fontSize: 28, color: "#a7adb4", maxWidth: 900 }}>{site.seo.description}</div>
        </div>
      </div>
    ),
    size,
  );
}
