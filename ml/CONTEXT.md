# ML Insights Microservice — Context

> This file provides fast orientation for AI agents and developers working on the ML service.
> Last updated: 2026-07-24

## What This Is

A private FastAPI microservice (`ml/`) that reads tenant-scoped data from the
main PostgreSQL database and produces ML-powered insights. The authenticated
FastAPI backend is its gateway; browser and frontend code never call ML
directly.

## Architecture

```
Next.js ── JWT ──> FastAPI gateway ── business ID + service token ──> ML
                         │                                      │
                         └──────────── PostgreSQL <──────────────┘
```

- **Gateway coupling**: `server/app/routers/insights.py` derives tenant scope
  from authenticated context and calls ML privately.
- **Client integration**: `client/lib/ml-api.ts` fetches tenant-scoped results
  through FastAPI. The Insights page lives at
  `client/app/business/insights/`.
- **Docker**: Defined as the `ml` service in `server/docker-compose.yml`, depends on `postgres`.

## Directory Layout

```
ml/
├── src/
│   ├── main.py                     # FastAPI app, endpoints, lifespan
│   ├── config.py                   # Pydantic settings (DATABASE_URL, etc.)
│   ├── db.py                       # Async + sync engines, data loaders (load_reservations, etc.)
│   ├── features/
│   │   ├── reservation_features.py # Temporal, lead-time, demand aggregation features
│   │   └── customer_features.py    # RFM, behavioral, preferred-time features
│   ├── models/
│   │   ├── segmentation.py         # K-Means on RFM → customer segments
│   │   ├── cancellation.py         # LightGBM binary classifier → cancel probability
│   │   └── demand_forecast.py      # LightGBM regressor → 7-day demand forecast
│   ├── pipelines/
│   │   └── insights_pipeline.py    # Orchestrates load → features → train → store
│   └── utils/
│       └── metrics.py              # (placeholder for shared metric helpers)
├── notebooks/
│   └── exploration.ipynb           # Interactive EDA & prototyping
├── Dockerfile                      # python:3.12-slim + LightGBM deps
├── Dockerfile.test                 # reproducible Python 3.12 test image
├── requirements.txt                # Pinned deps (fastapi, lightgbm, scikit-learn, pandas, etc.)
├── requirements-test.txt           # Runtime pins plus pinned test runner
└── env.example                     # DATABASE_URL, DATABASE_URL_SYNC, ENVIRONMENT, LOG_LEVEL
```

## Three ML Models

### 1. Customer Segmentation (`models/segmentation.py`)
- **Algorithm**: K-Means clustering (scikit-learn)
- **Input**: RFM features (Recency, Frequency, Monetary) per customer
- **Output**: Segment labels — Champions, Loyal Customers, Potential Loyalists, At Risk, Lost Customers, Others
- **Evaluation**: Inertia (within-cluster sum of squares)
- **Key class**: `CustomerSegmentationModel.fit_predict(rfm_df)`

### 2. Cancellation Prediction (`models/cancellation.py`)
- **Algorithm**: LightGBM binary classifier
- **Input**: Reservation features (lead time, guests, day of week, hour, payment status) + customer history (past cancellation rate, total bookings, total spend)
- **Output**: Cancellation probability per reservation
- **Evaluation**: Stratified 5-Fold CV → AUC-ROC, Precision, Recall, F1
- **Key class**: `CancellationPredictionModel.train_and_evaluate(df)` → `CancellationPredictionResult`

### 3. Demand Forecasting (`models/demand_forecast.py`)
- **Algorithm**: LightGBM regressor (MAE objective)
- **Input**: Daily demand time series per business with lag features (1d, 7d, 14d), rolling means/stds (7d, 14d), calendar features
- **Output**: Predicted daily reservation count for next 7 days
- **Evaluation**: TimeSeriesSplit CV → MAE, RMSE, R², MAPE per business
- **Key class**: `DemandForecastModel.train_and_evaluate(df)` → `DemandForecastResult`

## Pipeline Flow (`pipelines/insights_pipeline.py`)

```
InsightsPipeline(business_id).run()
  ├── Step 1: load_reservations(business_id)
  │           + load_customers(business_id)                 ← db.py
  ├── Step 2: build_reservation_features()                  ← features/reservation_features.py
  │           build_customer_features()                     ← features/customer_features.py
  │           build_rfm_features()
  │           build_daily_demand()
  │           build_demand_timeseries_features()
  ├── Step 3: CustomerSegmentationModel.fit_predict(rfm)
  ├── Step 4: CancellationPredictionModel.train_and_evaluate(df)
  ├── Step 5: DemandForecastModel.train_and_evaluate(demand_ts)
  └── Step 6: _store_results() → INSERT INTO ml_predictions (segmentation only),
                                 UPSERT business_daily_metrics
```

## API Endpoints (port 8001)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Service health + DB connectivity |
| GET | `/businesses/{business_id}/status` | Latest pipeline run info |
| POST | `/businesses/{business_id}/pipeline/run` | Trigger the tenant pipeline |
| GET | `/businesses/{business_id}/results/summary` | High-level model results |
| GET | `/businesses/{business_id}/results/segmentation` | Customer segments |
| GET | `/businesses/{business_id}/results/cancellation` | Cancellation metrics |
| GET | `/businesses/{business_id}/results/demand` | Seven-day forecast |
| GET | `/businesses/{business_id}/history` | Tenant run history in this process |

All business endpoints require `X-ML-Internal-Token` outside development.

## Database Tables (owned by ML service)

Defined in `server/db/migrations/002_ml_tables.sql`:

- **`ml_predictions`** — Flexible JSONB store for model outputs (entity_type +
  entity_id pattern). **Only customer segmentation is written today**
  (`model_name='customer_segmentation'`, `entity_type='customer'`). Cancellation
  and demand results are evaluated but not persisted per-entity, so
  `analytics_service.get_high_risk_reservations` — which queries
  `model_name='cancellation'` — returns an empty list for every tenant. That gap
  is recorded in `docs/TODO.md` under Data and ML; the route returns an honest
  empty answer rather than a failure.
- **`business_daily_metrics`** — Pre-aggregated daily stats per business. UNIQUE
  on (business_id, date). `no_show_count` and `total_revenue` are columns from
  the original schema that nothing writes; `total_revenue` in particular must
  not be revived — `docs/PRODUCT.md` forbids labelling an uncollected total as
  revenue. Reporting reads the operational ledgers directly.
- **`ml_result_snapshots`** (migration 049, owned by the main app, not by ML) —
  the last successful dashboard payload per tenant and resource. Written by
  FastAPI on each successful read, served with `stale: true` when this service
  is unreachable. See "Failure is a degradation" below.

## Frontend Integration

- **API client**: `client/lib/ml-api.ts` — typed, no-store FastAPI gateway
  requests with graceful null returns
- **Insights page**: `client/app/business/insights/` — full ML dashboard with demand forecast chart, segmentation donut, cancellation metrics + feature importance
- **Overview page**: `client/app/business/overview/` — forecast teaser card (7-day total + busiest day) and segmentation teaser card (customer count + largest segment), with "Details →" links to Insights. Falls back to a "Set up" CTA when no ML data exists.
- **Customers page**: `client/app/business/customers/` — segment badge column in the customers table (Champions, Loyal, At Risk, etc.) when segmentation data is available. Column auto-hides when no ML data.
- **Requests page**: `client/app/business/requests/` — customer segment hint (emoji + label) shown next to Accept/Reject buttons, giving context on customer value when reviewing pending requests.
- **Sidebar**: "Insights" link with `BrainCircuit` icon, placed between Overview and Operations
- **Search**: Indexed in command palette under Navigation group

## Model Policy

These rules are the stage-6 answer to "when is an ML result fit to show an
operator". They are deliberately short and enforced by tests rather than by a
platform — `docs/TODO.md` keeps a full MLOps stack out of the MVP.

### Minimum data

A model that has not seen enough history produces a confident number about
nothing. Each model declares its own floor and reports `status` plus the reason
when it is not met, rather than returning a figure:

| Model | Constant | Floor | Below it |
|---|---|---|---|
| Customer segmentation | `segmentation.MIN_CUSTOMERS` | 20 guests with visit history | empty frame, `model.insufficient_reason` says the count seen |
| Cancellation prediction | `cancellation.MIN_TRAINING_SAMPLES` | 30 terminal reservations **and** both outcomes present | no model trained; `result.status == "insufficient_data"` with the reason |
| Demand forecast | `demand_forecast.MIN_HISTORY_DAYS` | 14 days of usable history per venue | no forecast for that venue; `result.insufficient_reasons[business_id]` says why |

The floors are module constants rather than configuration. A venue cannot lower
its own floor to make a chart appear.

A floor that is not met is an ordinary, expected state for a new venue — the
pilot venue will sit below all three for weeks. It is never an error.

### Reproducibility

Every model that fits takes a fixed `random_state`, and the pipeline records
`model_version` as `run_{run_id}` on each stored row. Re-running the pipeline
over an unchanged database must produce the same segments; a test asserts this
rather than trusting the seeds.

### Leakage

Features must be computable at prediction time. Concretely: no feature may read
a column written *by* the outcome it predicts. Cancellation features must not
touch `cancelled_at`, `cancelled_by`, `cancelled_late`, `no_show_at` or
`status`; demand features use only lags strictly before the day being forecast.
A leakage regression test builds a frame and asserts the outcome columns are
absent from the feature matrix — a near-perfect score on a real dataset is a
symptom, not a success.

### Drift and versioning

Each stored prediction carries `model_version` and `computed_at`, so a
suspicious figure can be traced to the run that produced it. There is no
automated drift monitor in the MVP; the manual check is that the segmentation
distribution and the cancellation base rate are reported on every run, so a
sudden shift is visible on the page rather than only in a metric nobody reads.

### Scheduling

The pipeline is trigger-driven: `POST /api/insights/run`, guarded by the
`insights.run` capability. There is no cron. A scheduled run is deferred until a
venue has enough history for the floors above to be met, because a nightly job
over insufficient data produces a nightly "insufficient data".

### Failure is a degradation, never a block

The operational loop must not depend on this service. If it is unreachable:

- Insights serves the last remembered result, marked `stale: true` with its
  `captured_at`, or an honest empty state when there is nothing remembered.
- `POST /api/insights/run` still returns 503, because there is nothing honest to
  remember about a run that never started.
- No reservation, order, tab, count or purchase order is affected in any way.

`server/tests/integration/test_insights_resilience.py` holds this contract.

## Key Design Decisions

1. **Sync engine for pipeline** — Pandas `read_sql` requires synchronous connections. The async engine is only used for FastAPI health checks.
2. **Tenant-keyed in-memory results** — `_latest_results` is keyed by business
   and is lost on restart. Since stage 6 that no longer empties the Insights
   page: FastAPI snapshots each successful read into `ml_result_snapshots` and
   serves the snapshot marked stale while this service is away.
3. **Per-business pipeline** — Data loading, segmentation, cancellation, and
   demand forecasting are scoped to the gateway-supplied business.
4. **Recursive forecasting** — Demand forecast uses a recursive approach: predict day N, use that prediction as a lag feature for day N+1.
5. **Private service authentication** — Outside development, tenant endpoints
   reject calls without the shared `ML_INTERNAL_TOKEN`. `/health` remains
   available for private platform health checks.

## Common Tasks

### Add a new feature to the pipeline
1. Add the feature computation in `features/reservation_features.py` or `features/customer_features.py`
2. Include it in the model's feature list (e.g., `CancellationPredictionModel.features`)
3. Update the notebook for testing

### Add a new model
1. Create `models/your_model.py` with a class following the pattern of existing models
2. Add a `_run_your_model()` method to `InsightsPipeline`
3. Add a `/results/your_model` endpoint in `main.py`
4. Add a section to the Insights page in `client/app/business/insights/insights-client.tsx`

### Run locally without Docker
```bash
cd ml && source venv/bin/activate
# Ensure Postgres is running (via docker compose up postgres)
uvicorn src.main:app --reload --port 8001
# Then call through FastAPI with an authenticated staff session:
# POST http://localhost:8000/api/insights/run
```

### Run the reproducible ML test environment

```bash
docker build -f ml/Dockerfile.test -t crowbar-ml-test ml
docker run --rm crowbar-ml-test
```

This deliberately uses Python 3.12, matching the production ML image, rather
than whichever Python version happens to be installed on the host.
