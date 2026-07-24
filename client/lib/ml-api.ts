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

async function mlFetch<T>(path: string): Promise<T | null> {
  const token = await getToken();
  if (!token) return null;

  try {
    const response = await fetch(`${API_BASE}/api/insights${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });

    if (!response.ok) return null;
    return response.json();
  } catch {
    // ML service might be down — fail gracefully
    return null;
  }
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

export interface MLHealthResponse {
  status: string;
  service: string;
  database: string;
  environment: string;
  timestamp: string;
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

export interface MLResultsSummary {
  run_id: string;
  timestamp: string;
  elapsed_seconds: number;
  data: {
    reservations: number;
    customers: number;
  };
  models: {
    segmentation: {
      status: string;
      n_customers?: number;
      segments?: Record<string, number>;
    };
    cancellation: {
      status: string;
      metrics?: {
        auc_roc: number;
        precision: number;
        recall: number;
        f1: number;
        support: number;
      };
    };
    demand_forecast: {
      status: string;
      businesses_modeled?: number;
    };
  };
}

// ─── API Functions ──────────────────────────────────────────────────────────

export async function fetchMLHealth(): Promise<MLHealthResponse | null> {
  return null;
}

export async function fetchMLStatus(): Promise<MLStatusResponse | null> {
  return mlFetch("/status");
}

export async function fetchMLResultsSummary(): Promise<MLResultsSummary | null> {
  return mlFetch("/results/summary");
}

export async function fetchMLSegmentation(): Promise<MLSegmentationResult | null> {
  return mlFetch("/segmentation");
}

export async function fetchMLCancellation(): Promise<MLCancellationResult | null> {
  return mlFetch("/cancellation");
}

export async function fetchMLDemandForecast(): Promise<MLDemandForecastResult | null> {
  return mlFetch("/demand");
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
