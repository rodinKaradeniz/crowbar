import type { NextConfig } from "next";

import {
  PUBLIC_NOT_IN_DEMO_PAGE,
  PUBLIC_ROUTES_NOT_IN_DEMO,
  WORKSPACE_NOT_IN_DEMO_PAGE,
  WORKSPACE_ROUTES_NOT_IN_DEMO,
} from "./lib/demo/scope";

const backendUrl =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8000";

// The frontend-only demo is a BUILD decision (`NEXT_PUBLIC_*` is inlined), and
// this guard makes it impossible to get half-right in either direction: a demo
// build that could reach a real backend, or a real build silently serving the
// mock with no demo indicator. See `lib/demo/mode.ts`.
const isDemoBuild = process.env.NEXT_PUBLIC_CROWBAR_DEMO === "true";
const DEMO_API_SUFFIX = "/demo-api";
const configuredApiUrls = [
  process.env.API_INTERNAL_URL,
  process.env.NEXT_PUBLIC_API_URL,
];
if (isDemoBuild) {
  if (!configuredApiUrls.every((url) => url?.replace(/\/+$/, "").endsWith(DEMO_API_SUFFIX))) {
    throw new Error(
      `NEXT_PUBLIC_CROWBAR_DEMO=true needs API_INTERNAL_URL and NEXT_PUBLIC_API_URL both set to a ${DEMO_API_SUFFIX} mock URL.`,
    );
  }
} else if (configuredApiUrls.some((url) => url?.replace(/\/+$/, "").endsWith(DEMO_API_SUFFIX))) {
  throw new Error(
    `An API URL points at a ${DEMO_API_SUFFIX} mock but NEXT_PUBLIC_CROWBAR_DEMO is not "true".`,
  );
}

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
  turbopack: {
    root: process.cwd(),
  },
  async rewrites() {
    const backendRewrites = [
      {
        source: "/api/backend/:path*",
        destination: `${backendUrl}/api/:path*`,
      },
    ];
    if (!isDemoBuild) {
      return backendRewrites;
    }
    // Demo builds only: routes outside the demo land on a designed page. These
    // run after `proxy.ts`, so a signed-out visitor still goes to sign in.
    return {
      beforeFiles: [
        ...WORKSPACE_ROUTES_NOT_IN_DEMO.map((source) => ({
          source,
          destination: WORKSPACE_NOT_IN_DEMO_PAGE,
        })),
        ...PUBLIC_ROUTES_NOT_IN_DEMO.map((source) => ({
          source,
          destination: PUBLIC_NOT_IN_DEMO_PAGE,
        })),
      ],
      afterFiles: backendRewrites,
      fallback: [],
    };
  },
  async headers() {
    const demoHeaders = isDemoBuild
      ? [
          {
            source: "/:path*",
            headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
          },
        ]
      : [];
    return [
      ...demoHeaders,
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      {
        source: "/reserve/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: `frame-ancestors ${reservationFrameAncestors}`,
          },
          { key: "Cache-Control", value: "no-store" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
      {
        source: "/auth/reset-password",
        headers: [
          { key: "Cache-Control", value: "no-store" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
      {
        source: "/invite",
        headers: [
          { key: "Cache-Control", value: "no-store" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
      {
        source: "/menu/:path*",
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
      },
      {
        source: "/order/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
};

export default nextConfig;
