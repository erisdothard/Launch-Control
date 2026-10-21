import { ImageResponse } from "next/og";
import { site } from "@/content/site";

/* The share card: black ground, the Grid Box mark, the wordmark and the headline. Colours are the
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
          <svg width="84" height="80" viewBox="0 0 126 120">
            <polygon fill="#c6ccd3" points="96,14 24,14 10,28 10,92 24,106 96,106 96,92 24,92 24,28 96,28" />
            <rect x="36" y="40" width="14" height="40" fill="#c6ccd3" />
            <polygon fill="#2bb24c" points="36,66 77,66 68,80 36,80" />
            <polygon fill="#f0c419" points="80,66 105,66 96,80 71,80" />
            <polygon fill="#e3261d" points="108,66 124,66 115,80 99,80" />
          </svg>
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
