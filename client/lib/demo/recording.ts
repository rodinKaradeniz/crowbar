import type { DemoRole } from "./token";

/**
 * The shape `client/scripts/record-demo-fixtures.mjs` writes and the mock reads.
 *
 * Bodies are stored once by content hash: most responses are identical across
 * roles. Keys are `METHOD /api/path?sorted=query` with dates as recorded.
 */
export type RecordingAudience = DemoRole | "public";

export interface RecordedResponse {
  status: number;
  /** Key into `bodies`; absent for an empty (204) response. */
  body?: string;
}

export interface DemoRecording {
  /** ISO instant the recording was taken. Day offsets are counted from it. */
  recordedAt: string;
  bodies: Record<string, unknown>;
  responses: Partial<Record<RecordingAudience, Record<string, RecordedResponse>>>;
}

/** The canonical lookup key for a request. Shared with the recorder. */
export function requestKey(method: string, path: string, query: URLSearchParams): string {
  const sorted = [...query.entries()].sort(([a, av], [b, bv]) =>
    a === b ? av.localeCompare(bv) : a.localeCompare(b),
  );
  const search = new URLSearchParams(sorted).toString();
  return `${method.toUpperCase()} ${path}${search ? `?${search}` : ""}`;
}
