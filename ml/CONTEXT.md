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
├── requirements.txt                # Pinned deps (fastapi, lightgbm, scikit-learn, pandas, etc.)
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
  └── Step 6: _store_results() → INSERT INTO ml_predictions, business_daily_metrics
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

- **`ml_predictions`** — Flexible JSONB store for all model outputs (entity_type + entity_id pattern)
- **`business_daily_metrics`** — Pre-aggregated daily stats per business (reservations, guests, revenue, utilization, peak hour). UNIQUE on (business_id, date).

## Frontend Integration

- **API client**: `client/lib/ml-api.ts` — typed, no-store FastAPI gateway
  requests with graceful null returns
- **Insights page**: `client/app/business/insights/` — full ML dashboard with demand forecast chart, segmentation donut, cancellation metrics + feature importance
- **Overview page**: `client/app/business/overview/` — forecast teaser card (7-day total + busiest day) and segmentation teaser card (customer count + largest segment), with "Details →" links to Insights. Falls back to a "Set up" CTA when no ML data exists.
- **Customers page**: `client/app/business/customers/` — segment badge column in the customers table (Champions, Loyal, At Risk, etc.) when segmentation data is available. Column auto-hides when no ML data.
- **Requests page**: `client/app/business/requests/` — customer segment hint (emoji + label) shown next to Accept/Reject buttons, giving context on customer value when reviewing pending requests.
- **Sidebar**: "Insights" link with `BrainCircuit` icon, placed between Overview and Operations
- **Search**: Indexed in command palette under Navigation group

## Key Design Decisions

1. **Sync engine for pipeline** — Pandas `read_sql` requires synchronous connections. The async engine is only used for FastAPI health checks.
2. **Tenant-keyed in-memory results** — `_latest_results` is keyed by business.
   Results are lost on restart; durable result-summary restoration is tracked
   in `docs/TODO.md`.
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
