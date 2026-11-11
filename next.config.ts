import type { NextConfig } from "next";

// Static export: the whole app runs in the browser, no server.
const nextConfig: NextConfig = {
  output: "export",
};

export default nextConfig;
