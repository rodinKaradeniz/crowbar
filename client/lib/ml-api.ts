/**
 * ML Insights API client.
 *
 * Fetches tenant-scoped insights through the authenticated FastAPI gateway.
 * The private ML service is never addressed by browser or frontend code.
 */

import { getToken } from "@/lib/api";

const API_BASE =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8000";

/**
 * WHY A STATE AND NOT A NULL.
 *
 * The server goes to real trouble to be honest about an insight: `_read` in
 * `server/app/routers/insights.py` falls back to the last snapshot and
 * `ml_snapshot_service` stamps it with `stale`, `captured_at` and an
 * `unavailable_reason`, "so an operator can always tell a remembered number
 * from a live one". This module used to collapse every one of those answers —
 * plus a 403 for a switched-off module, a 404 for a model with no result, and a
 * dropped connection — into a single `null`, and the page then rendered its
 * "nothing has run yet" empty state for all of them. That sentence is a claim
 * about the venue's data, and in three of those five cases it is false.
 *
 * So a fetch returns which of them happened, and the caller decides what to
 * say. Nothing here decides copy.
 */
export type MLState =
  /** 200, `stale: false`. A figure produced now. */
  | "live"
  /** 200, `stale: true` with a real `captured_at`. Remembered, and datable. */
  | "remembered"
  /** 200, `status: "unavailable"`, no `captured_at`. The service is away and
   *  has never produced a result for this venue. */
  | "unreachable"
  /** 404. The service ANSWERED: it is up, and this model has no result — not
   *  enough history, or never retrained. `reason` carries why, in words. */
  | "no-result"
  /** 403 MODULE_DISABLED. The venue switched Insights off. Not a failure. */
  | "module-disabled"
  /** Anything else, including a dropped connection. Degrade quietly. */
  | "error";

export interface MLResult<T> {
  state: MLState;
  /** The payload, when there is one. `null` for every non-2xx state. */
  data: T | null;
  /** ISO 8601, in UTC, only on `remembered`. Format at the render boundary
   *  with the BUSINESS timezone — never the browser's. */
  capturedAt: string | null;
  /** The server's own sentence about why this is not live. Shown as-is where
   *  it is shown at all; it is written to be read by an operator. */
  unavailableReason: string | null;
}

/** The three fields the server adds to every insights body. */
interface MLEnvelope {
  stale?: boolean;
  captured_at?: string | null;
  unavailable_reason?: string | null;
  status?: string;
  reason?: string;
}

function empty<T>(state: MLState, reason: string | null = null): MLResult<T> {
  return { state, data: null, capturedAt: null, unavailableReason: reason };
}

async function mlFetch<T>(path: string): Promise<MLResult<T>> {
  const token = await getToken();
  if (!token) return empty<T>("error");

  let response: Response;
  try {
    response = await fetch(`${API_BASE}/api/insights${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch {
    // Transport failure. The insights surface is optional and must never take
    // the page down with it.
    return empty<T>("error");
  }

  if (!response.ok) {
    // The gateway flattens every error to a top-level {code, message, details}
    // — there is no `detail` wrapper. A body that will not parse is still an
    // error, just one we cannot describe.
    let code: string | null = null;
    let message: string | null = null;
    try {
      const body = (await response.json()) as {
        code?: string;
        message?: string;
      };
      code = body.code ?? null;
      message = body.message ?? null;
    } catch {
      /* keep both null */
    }

    if (response.status === 403 && code === "MODULE_DISABLED") {
      return empty<T>("module-disabled");
    }
    if (response.status === 404) {
      // Note: the gateway labels this `INTERNAL_ERROR` in the body while
      // returning 404. The STATUS is the honest half, so branch on it.
      return empty<T>("no-result", message);
    }
    return empty<T>("error");
  }

  let payload: (T & MLEnvelope) | null = null;
  try {
    payload = (await response.json()) as T & MLEnvelope;
  } catch {
    return empty<T>("error");
  }
  if (payload === null || typeof payload !== "object") {
    return empty<T>("error");
  }

  const reason = payload.unavailable_reason ?? null;

  if (payload.stale === true) {
    const capturedAt = payload.captured_at ?? null;
    // `as_empty_response` is the one with no capture time: the service is away
    // AND has never produced a result here. `as_stale_response` always has one.
    if (capturedAt === null) {
      return empty<T>("unreachable", reason);
    }
    return { state: "remembered", data: payload, capturedAt, unavailableReason: reason };
  }

  return { state: "live", data: payload, capturedAt: null, unavailableReason: null };
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface MLPipelineResult {
  run_id: string;
  timestamp: string;
  elapsed_seconds: number;
  data: {
    reservations: number;
    customers: number;
  };
  segmentation: MLSegmentationResult;
  cancellation: MLCancellationResult;
  demand_forecast: MLDemandForecastResult;
}

export interface MLSegmentationResult {
  status: string;
  n_customers?: number;
  segments?: Record<string, number>;
  model_summary?: {
    n_clusters: number;
    centroids: Array<{
      cluster: number;
      recency: number;
      frequency: number;
      monetary: number;
    }>;
    labels: Record<string, string>;
  };
  customer_segments?: Array<{
    customer_id: string;
    recency: number;
    frequency: number;
    monetary: number;
    segment_label: string;
  }>;
  reason?: string;
  error?: string;
}

export interface MLCancellationResult {
  status: string;
  metrics?: {
    auc_roc: number;
    precision: number;
    recall: number;
    f1: number;
    support: number;
  };
  feature_importance?: Record<string, number>;
  classification_report?: string;
  predictions_count?: number;
  reason?: string;
  error?: string;
}

export interface MLDemandForecastResult {
  status: string;
  metrics?: Record<
    string,
    {
      mae: number;
      rmse: number;
      r2: number;
      mape: number;
      support: number;
    }
  >;
  feature_importance?: Record<string, number>;
  forecasts?: Record<
    string,
    Array<{
      date: string;
      predicted_reservations: number;
      is_weekend: number;
    }>
  >;
  reason?: string;
  error?: string;
}


export interface MLStatusResponse {
  status: string;
  message?: string;
  latest_run?: {
    run_id: string;
    timestamp: string;
    elapsed_seconds: number;
    data_summary: {
      reservations: number;
      customers: number;
    };
  };
  total_runs?: number;
}


// ─── API Functions ──────────────────────────────────────────────────────────

export async function fetchMLStatus(): Promise<MLResult<MLStatusResponse>> {
  return mlFetch<MLStatusResponse>("/status");
}

export async function fetchMLSegmentation(): Promise<MLResult<MLSegmentationResult>> {
  return mlFetch<MLSegmentationResult>("/segmentation");
}

export async function fetchMLCancellation(): Promise<MLResult<MLCancellationResult>> {
  return mlFetch<MLCancellationResult>("/cancellation");
}

export async function fetchMLDemandForecast(): Promise<MLResult<MLDemandForecastResult>> {
  return mlFetch<MLDemandForecastResult>("/demand");
}

export async function triggerMLPipeline(): Promise<MLPipelineResult | null> {
  try {
    const token = await getToken();
    if (!token) return null;
    const response = await fetch(`${API_BASE}/api/insights/run`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}
