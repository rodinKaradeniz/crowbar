import type { NextConfig } from "next";

const backendUrl =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8000";

const configuredFrameAncestors = (
  process.env.RESERVATION_FRAME_ANCESTORS || "'self'"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(
    (origin) =>
      origin === "'self'" ||
      /^https?:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(origin),
  );
const reservationFrameAncestors = configuredFrameAncestors.length
  ? configuredFrameAncestors.join(" ")
  : "'self'";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/backend/:path*",
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/reserve/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: `frame-ancestors ${reservationFrameAncestors}`,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
