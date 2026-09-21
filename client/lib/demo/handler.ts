import { hasCapability } from "@/lib/permissions";

import recording from "./fixtures/recording.json";
import type { DemoRecording, RecordedResponse } from "./recording";
import { requestKey } from "./recording";
import { dayOffset, serviceDayNumber, shiftJson, shiftValue } from "./time-shift";
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

const INSTANT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * A request key with the instants in its query reduced to what stays true on a
 * later day.
 *
 * Range reads such as reports and cost control ask from a browser-local
 * midnight up to "now", to the millisecond, so their exact key is never asked
 * twice. What does repeat is the range's span: "last 7 days" is seven whole
 * days whenever it is asked. A query with two or more instants is keyed by
 * that span; a lone instant by its service day.
 */
function coarseKey(key: string): string {
  const [target, search] = key.split("?");
  if (!search) return key;
  const params = new URLSearchParams(search);
  const instants = [...params.entries()].filter(([, value]) => INSTANT_RE.test(value));
  if (instants.length === 0) return key;
  const times = instants.map(([, value]) => Date.parse(value));
  const marker =
    instants.length > 1
      ? `span:${Math.floor((Math.max(...times) - Math.min(...times)) / 86_400_000)}`
      : `day:${serviceDayNumber(times[0])}`;
  for (const [name] of instants) params.set(name, marker);
  return `${target}?${params.toString()}`;
}

const coarseIndex: Partial<Record<string, Map<string, RecordedResponse>>> = Object.fromEntries(
  Object.entries(data.responses).map(([audience, responses]) => [
    audience,
    new Map(Object.entries(responses ?? {}).map(([key, entry]) => [coarseKey(key), entry])),
  ]),
);

function lookup(audience: string, key: string): RecordedResponse | undefined {
  const responses = data.responses[audience as keyof DemoRecording["responses"]];
  return responses?.[key] ?? coarseIndex[audience]?.get(coarseKey(key));
}

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
  const own = role ? lookup(role, key) : undefined;
  if (own) return toResponse(own, days);

  const shared = lookup("public", key);
  if (shared) return toResponse(shared, days);

  // A staff endpoint asked without a demo session is what the real API calls
  // unauthenticated; anything else simply was not recorded.
  const recordedForSomeRole = Object.keys(data.responses).some(
    (audience) => audience !== "public" && lookup(audience, key),
  );
  if (recordedForSomeRole && !role) return error(401, UNAUTHENTICATED);
  return error(404, DEMO_NOT_RECORDED);
}
