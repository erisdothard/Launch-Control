import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native binary (the signature name image); bundling it breaks the server build.
  serverExternalPackages: ["@resvg/resvg-js"],
};

export default nextConfig;
