import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Runtime snapshots are written at run time; never bundle stale ones into the build.
  outputFileTracingExcludes: {
    "*": ["./data/**"],
  },
};

export default nextConfig;
