import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@holyword/core", "@holyword/offline"],
  poweredByHeader: false,
  // Self-contained server bundle for the Elastic Beanstalk deploy
  // (scripts/build-bundle.mjs). No effect on `next dev` or the tests.
  output: "standalone",
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
