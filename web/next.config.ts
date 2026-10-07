import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dev badge overlaps the bottom-left HUD readout in review captures.
  devIndicators: false,
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
