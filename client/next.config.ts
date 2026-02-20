import type { NextConfig } from "next";
import { createMDX } from "fumadocs-mdx/next";

const backendUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/backend/:path*",
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

const withMDX = createMDX();

export default withMDX(nextConfig);
