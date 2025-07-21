import type { NextConfig } from "next";
import dotenv from 'dotenv';

dotenv.config();

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
