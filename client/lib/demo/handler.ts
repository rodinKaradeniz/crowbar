import { hasCapability } from "@/lib/permissions";

import recording from "./fixtures/recording.json";
import type { DemoRecording, RecordedResponse } from "./recording";
import { requestKey } from "./recording";
import { dayOffset, shiftJson, shiftValue } from "./time-shift";
import { readDemoRole } from "./token";

/**
 * The mock API: the backend's HTTP contract, answered from one recorded
 * evening.
 *
 * Pure — method, path, query and Authorization in; status and JSON out. It
 * never calls anything, so a demo cannot send mail, SMS, reach a provider or
 * the ML service.
 *
 * READ-ONLY. Every write is answered with `DEMO_NOT_SAVED`, which reaches the
 * operator through the normal error paths, so nothing ever claims to be saved.
 * A GET that was never recorded is `DEMO_NOT_RECORDED` rather than invented.
 */

const data = recording as DemoRecording;

export interface DemoRequest {
  method: string;
  /** Backend path, starting `/api/`. */
  path: string;
  query: URLSearchParams;
  authorization: string | null;
  nowMs?: number;
}

export interface DemoResponse {
  status: number;
  body: unknown;
}

export const DEMO_NOT_SAVED = {
  code: "DEMO_NOT_SAVED",
  message: "Not saved. This is a demo, so changes are not kept.",
  details: null,
};

const DEMO_NOT_RECORDED = {
  code: "DEMO_NOT_RECORDED",
  message: "This is not part of the demo.",
  details: null,
};

/**
 * The demo has no insights service, so it never shows a prediction — recorded
 * or otherwise. It answers with the backend's own "unavailable and nothing
 * captured" body (`ml_snapshot_service.as_empty_response`), which the Insights
 * page already renders honestly as the `unreachable` state.
 */
const INSIGHT_RESOURCES = new Set(["status", "segmentation", "cancellation", "demand"]);

function insightsAnswer(resource: string): object {
  return {
    status: "unavailable",
    stale: true,
    captured_at: null,
    unavailable_reason:
      "The demo runs without the insights service, so it has no results to show.",
    resource,
  };
}

const FORBIDDEN = {
  code: "FORBIDDEN",
  message: "Your role does not include this.",
  details: null,
};

const UNAUTHENTICATED = {
  code: "UNAUTHORIZED",
  message: "Not authenticated",
  details: null,
};

function error(status: number, body: object): DemoResponse {
  // The backend's own envelope, flat: `{code, message, details}`
  // (`server/app/core/errors.py`).
  return { status, body };
}

function toResponse(entry: RecordedResponse, days: number): DemoResponse {
  const body = entry.body === undefined ? null : data.bodies[entry.body];
  return { status: entry.status, body: shiftJson(body, days) };
}

export function handleDemoRequest(request: DemoRequest): DemoResponse {
  const method = request.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    return error(409, DEMO_NOT_SAVED);
  }

  const days = dayOffset(data.recordedAt, request.nowMs);
  const recordedPath = request.path
    .split("/")
    .map((segment) => shiftValue(decodeURIComponent(segment), -days))
    .join("/");
  const recordedQuery = new URLSearchParams(
    [...request.query.entries()].map(([key, value]) => [key, shiftValue(value, -days)]),
  );
  const key = requestKey("GET", recordedPath, recordedQuery);

  const role = readDemoRole(request.authorization, request.nowMs);

  const insight = /^\/api\/insights\/([a-z]+)$/.exec(request.path);
  if (insight && INSIGHT_RESOURCES.has(insight[1])) {
    if (!role) return error(401, UNAUTHENTICATED);
    if (!hasCapability(role, "insights.view")) return error(403, FORBIDDEN);
    return { status: 200, body: insightsAnswer(insight[1]) };
  }
  const own = role ? data.responses[role]?.[key] : undefined;
  if (own) return toResponse(own, days);

  const shared = data.responses.public?.[key];
  if (shared) return toResponse(shared, days);

  // A staff endpoint asked without a demo session is what the real API calls
  // unauthenticated; anything else simply was not recorded.
  const recordedForSomeRole = Object.entries(data.responses).some(
    ([audience, responses]) => audience !== "public" && responses?.[key],
  );
  if (recordedForSomeRole && !role) return error(401, UNAUTHENTICATED);
  return error(404, DEMO_NOT_RECORDED);
}
