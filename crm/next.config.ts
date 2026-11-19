import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native binary (the signature name image); bundling it breaks the server build.
  serverExternalPackages: ["@resvg/resvg-js"],
  // Serve images as the files themselves; Vercel's image service answers 402 once the allowance is used up.
  images: { unoptimized: true },
};

export default nextConfig;
