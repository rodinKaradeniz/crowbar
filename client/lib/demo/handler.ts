import { hasCapability } from "@/lib/permissions";

import recording from "./fixtures/recording.json";
import type { DemoRecording, RecordedResponse } from "./recording";
import { requestKey } from "./recording";
import type { DemoOp } from "./ops";
import { projectRead } from "./project";
import { DEMO_BUSINESS_ID } from "./snapshot";
import { reduceOps, type DemoState } from "./state";
import { dayOffset, serviceDayNumber, shiftJson, shiftValue } from "./time-shift";
import { readDemoRole, type DemoRole } from "./token";
import { handleDemoWrite } from "./writes";

/**
 * The mock API: the backend's HTTP contract, answered from one recorded
 * evening.
 *
 * Pure — method, path, query and Authorization in; status and JSON out. It
 * never calls anything, so a demo cannot send mail, SMS, reach a provider or
 * the ML service.
 *
 * Writes are the visitor's own. The service loop is replayed from a log in
 * their cookie over the recorded evening (`writes.ts`, `state.ts`,
 * `project.ts`); every other write is refused in words. A GET that was never
 * recorded is `DEMO_NOT_RECORDED` rather than invented.
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
  /** The parsed request body, for writes. */
  body?: unknown;
  /** The visitor's op log, as their cookie carries it. */
  ops?: readonly DemoOp[];
  nowMs?: number;
}

export interface DemoResponse {
  status: number;
  body: unknown;
  /** Set when the write changed the log and the cookie must be rewritten. */
  ops?: DemoOp[];
}

const DEMO_NOT_RECORDED = {
  code: "DEMO_NOT_RECORDED",
  message: "This is not part of the demo.",
  details: null,
};

/**
 * The demo has no insights service, so it never shows a prediction — recorded
 * or otherwise. It answers with the backend's own "unavailable and nothing
 * captured" body (`ml_snapshot_service.as_empty_response`). The Insights page
 * itself is out of the demo (`scope.ts`); Overview's forecast panel shows this
 * sentence, so it says the exclusion is deliberate rather than an outage.
 */
const INSIGHT_RESOURCES = new Set(["status", "segmentation", "cancellation", "demand"]);

function insightsAnswer(resource: string): object {
  return {
    status: "unavailable",
    stale: true,
    captured_at: null,
    unavailable_reason:
      "Insights is not part of this demo, so there are no forecasts to show.",
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

/**
 * One read: the recorded answer for it, shifted onto today, with the
 * visitor's own evening laid over the top.
 */
function read(
  path: string,
  query: URLSearchParams,
  role: DemoRole | null,
  state: DemoState,
  nowMs: number | undefined,
): DemoResponse {
  const days = dayOffset(data.recordedAt, nowMs);
  const recordedPath = path
    .split("/")
    .map((segment) => shiftValue(decodeURIComponent(segment), -days))
    .join("/");
  const recordedQuery = new URLSearchParams(
    [...query.entries()].map(([key, value]) => [key, shiftValue(value, -days)]),
  );
  // The staff availability read is answered from the public recording.
  //
  // `GET /api/reservations/availability`
  // (server/app/routers/reservations.py:298-305) and
  // `GET /api/availability/business/{id}`
  // (server/app/routers/availability.py:34-41) both call
  // availability_service.get_availability with the same six arguments and
  // return the same AvailabilityResponse. Only their preconditions differ: a
  // rate limit and the public-booking gate on one, reservations.view and the
  // module check on the other. The recorder walked the public route only, so
  // the staff key is rewritten to it and gated here instead.
  //
  // This alias holds only while the two routers keep delegating identically.
  let keyPath = recordedPath;
  if (recordedPath === "/api/reservations/availability") {
    if (!role) return error(401, UNAUTHENTICATED);
    if (!hasCapability(role, "reservations.view")) return error(403, FORBIDDEN);
    keyPath = `/api/availability/business/${DEMO_BUSINESS_ID}`;
  }
  const key = requestKey("GET", keyPath, recordedQuery);

  const insight = /^\/api\/insights\/([a-z]+)$/.exec(path);
  if (insight && INSIGHT_RESOURCES.has(insight[1])) {
    if (!role) return error(401, UNAUTHENTICATED);
    if (!hasCapability(role, "insights.view")) return error(403, FORBIDDEN);
    return { status: 200, body: insightsAnswer(insight[1]) };
  }

  const own = role ? lookup(role, key) : undefined;
  const shared = own ? undefined : lookup("public", key);
  const found = own ?? shared;
  const recorded = found ? toResponse(found, days) : null;

  const projected = projectRead(path, query, recorded, state, nowMs ?? Date.now());
  if (projected) return projected;
  if (recorded) return recorded;

  // A staff endpoint asked without a demo session is what the real API calls
  // unauthenticated; anything else simply was not recorded.
  const recordedForSomeRole = Object.keys(data.responses).some(
    (audience) => audience !== "public" && lookup(audience, key),
  );
  if (recordedForSomeRole && !role) return error(401, UNAUTHENTICATED);
  return error(404, DEMO_NOT_RECORDED);
}

export function handleDemoRequest(request: DemoRequest): DemoResponse {
  const method = request.method.toUpperCase();
  const role = readDemoRole(request.authorization, request.nowMs);
  const ops = request.ops ?? [];

  if (method !== "GET" && method !== "HEAD") {
    const result = handleDemoWrite({
      method,
      path: request.path,
      body: request.body,
      role,
      nowMs: request.nowMs ?? Date.now(),
      ops,
    });

    if (result.reread) {
      // The write's reply is the read's own answer, so a new round and a
      // recorded one come back through exactly the same shift and projection.
      const state = reduceOps(result.ops ?? ops);
      const answer = read(result.reread.path, new URLSearchParams(), role, state, request.nowMs);
      const list = Array.isArray(answer.body) ? (answer.body as { id?: string }[]) : [];
      const picked = list.find((entry) => entry.id === result.reread!.pickId);
      return {
        status: picked ? result.status : 404,
        body: picked ?? DEMO_NOT_RECORDED,
        ...(result.ops ? { ops: result.ops } : {}),
      };
    }

    return {
      status: result.status,
      body: result.body ?? null,
      ...(result.ops ? { ops: result.ops } : {}),
    };
  }

  return read(request.path, request.query, role, reduceOps(ops), request.nowMs);
}
