import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    if (process.env.NODE_ENV === "development") {
      return [
        {
          source: "/api/chat/:path*",
          destination: "http://localhost:8006/api/chat/:path*",
        },
      ];
    }
    return [];
  },
};

export default nextConfig;

