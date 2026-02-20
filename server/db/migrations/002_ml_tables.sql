-- 002_ml_tables.sql
-- Tables for ML insights microservice (predictions, daily metrics)

-- ML Predictions: stores output from all ML models
-- Flexible JSONB prediction column supports any model type
CREATE TABLE IF NOT EXISTS ml_predictions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
    model_name VARCHAR(100) NOT NULL,
    model_version VARCHAR(50),
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    prediction JSONB NOT NULL,
    computed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ml_predictions_model ON ml_predictions(model_name);
CREATE INDEX IF NOT EXISTS idx_ml_predictions_entity ON ml_predictions(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_ml_predictions_business ON ml_predictions(business_id);
CREATE INDEX IF NOT EXISTS idx_ml_predictions_computed ON ml_predictions(computed_at);

-- Business Daily Metrics: pre-aggregated daily stats per business
-- Populated by the ML pipeline, used for fast time-series queries and forecasting
CREATE TABLE IF NOT EXISTS business_daily_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    total_reservations INTEGER DEFAULT 0,
    completed_reservations INTEGER DEFAULT 0,
    cancelled_reservations INTEGER DEFAULT 0,
    no_show_count INTEGER DEFAULT 0,
    total_guests INTEGER DEFAULT 0,
    total_revenue DECIMAL(10, 2) DEFAULT 0,
    avg_lead_time_hours DECIMAL(10, 2),
    peak_hour INTEGER,
    utilization_rate DECIMAL(5, 4),
    computed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(business_id, date)
);

CREATE INDEX IF NOT EXISTS idx_daily_metrics_business ON business_daily_metrics(business_id);
CREATE INDEX IF NOT EXISTS idx_daily_metrics_date ON business_daily_metrics(date);
