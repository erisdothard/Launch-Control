import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dev badge overlaps the bottom-left HUD readout in review captures.
  devIndicators: false,
  /* Work screenshots are text-heavy UI captured at 2x; 75 softens the type. Next 16 allowlists qualities. */
  images: { qualities: [75, 90] },
  /* Asset filenames are versioned (engine-v2.glb, crm-demo-v1-1080.mp4), never overwritten in place, so they cache for a year.
     The draco decoder keeps three's filenames; it gets a week. */
  async headers() {
    const year = "public, max-age=31536000, immutable";
    return [
      { source: "/models/:path*", headers: [{ key: "Cache-Control", value: year }] },
      { source: "/hdr/:path*", headers: [{ key: "Cache-Control", value: year }] },
      { source: "/video/:path*", headers: [{ key: "Cache-Control", value: year }] },
      { source: "/draco/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=604800" }] },
    ];
  },
  // .glsl files import as raw strings (src/shaders/*). Turbopack uses the local loader,
  // webpack uses the built-in asset/source type. Typed in src/shaders/glsl.d.ts.
  turbopack: {
    rules: {
      "*.glsl": { loaders: ["./tools/glsl-loader.cjs"], as: "*.js" },
    },
  },
  webpack: (config) => {
    config.module.rules.push({ test: /\.glsl$/, type: "asset/source" });
    return config;
  },
};

export default nextConfig;
