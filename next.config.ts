import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    return [
      {
        source: "/player/:id.html",
        destination: "/api/player-html/:id",
      },
    ]
  },
};

export default nextConfig;