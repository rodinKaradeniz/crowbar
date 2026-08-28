-- Settlement is an audited assertion about an external register.
-- Legacy closure columns remain read-only compatibility data.

ALTER TABLE tabs ALTER COLUMN status TYPE VARCHAR(24);
UPDATE tabs SET status = 'settled_externally' WHERE status = 'closed';

CREATE TABLE tab_settlement_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE RESTRICT,
    tab_id UUID NOT NULL REFERENCES tabs(id) ON DELETE RESTRICT,
    event_type VARCHAR(24) NOT NULL,
    actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    currency_code VARCHAR(3) NOT NULL,
    total_snapshot NUMERIC(18,4) NOT NULL,
    informational_method VARCHAR(16),
    note TEXT,
    external_register_reference VARCHAR(255),
    related_settlement_event_id UUID REFERENCES tab_settlement_events(id) ON DELETE RESTRICT,
    idempotency_key VARCHAR(100),
    command_fingerprint VARCHAR(64),
    CONSTRAINT ck_tab_settlement_event_type CHECK (
        event_type IN ('settled_externally', 'reopened')
    ),
    CONSTRAINT ck_tab_settlement_method CHECK (
        informational_method IS NULL
        OR informational_method IN ('cash', 'card', 'mixed', 'other')
    ),
    CONSTRAINT ck_tab_settlement_total CHECK (total_snapshot >= 0),
    CONSTRAINT ck_tab_settlement_currency CHECK (currency_code ~ '^[A-Z]{3}$')
);
CREATE UNIQUE INDEX uq_tab_settlement_events_business_idempotency
    ON tab_settlement_events(business_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;
CREATE INDEX idx_tab_settlement_events_tenant_tab_time
    ON tab_settlement_events(business_id, tab_id, occurred_at DESC);

ALTER TABLE tabs
    ADD COLUMN current_settlement_event_id UUID
        REFERENCES tab_settlement_events(id) ON DELETE RESTRICT;

WITH legacy AS (
    SELECT
        gen_random_uuid() AS event_id,
        t.id AS tab_id,
        t.business_id,
        t.closed_by,
        COALESCE(t.closed_at, t.updated_at, NOW()) AS occurred_at,
        COALESCE(MAX(o.currency_code), b.currency_code) AS currency_code,
        COALESCE(SUM(o.total_amount) FILTER (WHERE o.status <> 'cancelled'), 0) AS total_snapshot,
        CASE WHEN t.settled_method = 'comp' THEN 'other' ELSE t.settled_method END AS method,
        CASE WHEN t.settled_method = 'comp'
            THEN 'Migrated from legacy comp marker; no payment or fiscal meaning is inferred.'
            ELSE 'Migrated from legacy closed tab.'
        END AS migration_note
    FROM tabs t
    JOIN businesses b ON b.id = t.business_id
    LEFT JOIN orders o ON o.tab_id = t.id
    WHERE t.status = 'settled_externally'
    GROUP BY t.id, t.business_id, t.closed_by, t.closed_at, t.updated_at,
             t.settled_method, b.currency_code
), inserted AS (
    INSERT INTO tab_settlement_events (
        id, business_id, tab_id, event_type, actor_id, occurred_at,
        currency_code, total_snapshot, informational_method, note
    )
    SELECT event_id, business_id, tab_id, 'settled_externally', closed_by,
           occurred_at, currency_code, total_snapshot, method, migration_note
    FROM legacy
    RETURNING id, tab_id
)
UPDATE tabs t
SET current_settlement_event_id = inserted.id
FROM inserted
WHERE inserted.tab_id = t.id;

CREATE INDEX idx_tabs_tenant_status_updated
    ON tabs(business_id, status, updated_at DESC);
