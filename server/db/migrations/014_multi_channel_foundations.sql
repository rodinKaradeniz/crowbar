-- Migration 014: Multi-channel foundations
-- Adds the customer identity, tables, and bot-config primitives.
-- All new columns on existing tables are nullable; CHECK constraints on
-- channel/fulfillment_type are added in Phase B once cutover is complete.

-- ─── Customers ────────────────────────────────────────────────────────────────
-- Single identity for unauthenticated humans interacting with a business.
-- Phone is the canonical unique key per business; email is a non-unique
-- attribute. Phoneless flows (queue walk-ups without phone, anonymous QR
-- orders) do NOT create a customers row.

CREATE TABLE IF NOT EXISTS customers (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID         NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name        VARCHAR(255),
    phone       VARCHAR(50),
    email       VARCHAR(255),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_business_phone
    ON customers(business_id, phone)
    WHERE phone IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customers_business
    ON customers(business_id);

CREATE TRIGGER update_customers_updated_at
    BEFORE UPDATE ON customers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── Tables ───────────────────────────────────────────────────────────────────
-- Per-business dining tables for QR ordering. Soft-deleted (deleted_at) so
-- order FKs survive. qr_token_revision is bumped to invalidate printed QRs.

CREATE TABLE IF NOT EXISTS tables (
    id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id        UUID         NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    location_id        UUID         REFERENCES locations(id) ON DELETE SET NULL,
    label              VARCHAR(100) NOT NULL,
    capacity           INTEGER      NOT NULL DEFAULT 2,
    qr_token_revision  INTEGER      NOT NULL DEFAULT 1,
    is_active          BOOLEAN      NOT NULL DEFAULT true,
    deleted_at         TIMESTAMPTZ,
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tables_business_active
    ON tables(business_id)
    WHERE deleted_at IS NULL;

CREATE TRIGGER update_tables_updated_at
    BEFORE UPDATE ON tables
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── Bot Configs ──────────────────────────────────────────────────────────────
-- Per-business per-channel conversational bot configuration. One row per
-- (business_id, channel). enabled_intents is a JSONB array of intent keys
-- the bot is allowed to handle (subset of {ordering, reservations, queue}).

CREATE TABLE IF NOT EXISTS bot_configs (
    id                       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id              UUID         NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    channel                  VARCHAR(16)  NOT NULL,
    greeting                 TEXT,
    tone                     VARCHAR(32),
    enabled_intents          JSONB        NOT NULL DEFAULT '[]'::jsonb,
    hours_behavior           VARCHAR(32),
    system_prompt_override   TEXT,
    version                  INTEGER      NOT NULL DEFAULT 1,
    created_at               TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE (business_id, channel)
);

CREATE TRIGGER update_bot_configs_updated_at
    BEFORE UPDATE ON bot_configs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── Orders: multi-channel and fulfillment columns ────────────────────────────
-- All nullable in this phase. CHECK constraints land in Phase B.
-- table_id replaces the free-text table_identifier (kept for backwards compat).

ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS customer_id       UUID         REFERENCES customers(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS channel           VARCHAR(16),
    ADD COLUMN IF NOT EXISTS fulfillment_type  VARCHAR(16),
    ADD COLUMN IF NOT EXISTS table_id          UUID         REFERENCES tables(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS delivery_address  TEXT,
    ADD COLUMN IF NOT EXISTS scheduled_for     TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_orders_customer
    ON orders(customer_id)
    WHERE customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_table
    ON orders(table_id)
    WHERE table_id IS NOT NULL;

-- ─── Reservations: customer_id_new (parallel column for cutover) ──────────────
-- Phase A.5 backfills this and renames it to customer_id, dropping the legacy
-- FK to users. We use a parallel column so reads can fall back during the
-- migration window.

ALTER TABLE reservations
    ADD COLUMN IF NOT EXISTS customer_id_new   UUID         REFERENCES customers(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS channel           VARCHAR(16),
    ADD COLUMN IF NOT EXISTS idempotency_key   VARCHAR(100);

CREATE UNIQUE INDEX IF NOT EXISTS idx_reservations_idempotency_key
    ON reservations(idempotency_key)
    WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reservations_customer_new
    ON reservations(customer_id_new)
    WHERE customer_id_new IS NOT NULL;

-- ─── Queue Entries: customer_id, channel, idempotency_key ─────────────────────

ALTER TABLE queue_entries
    ADD COLUMN IF NOT EXISTS customer_id       UUID         REFERENCES customers(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS channel           VARCHAR(16),
    ADD COLUMN IF NOT EXISTS idempotency_key   VARCHAR(100);

CREATE UNIQUE INDEX IF NOT EXISTS idx_queue_entries_idempotency_key
    ON queue_entries(idempotency_key)
    WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_queue_entries_customer
    ON queue_entries(customer_id)
    WHERE customer_id IS NOT NULL;

-- ─── Businesses: ordering_config and bot_enabled ──────────────────────────────
-- ordering_config.allowed_fulfillment_types gates which fulfillment modes the
-- business accepts. Bar default: ["dine_in"]. Delivery business: ["delivery", "pickup"].
-- bot_enabled is a fast on/off flag for the bot service to short-circuit lookups.

ALTER TABLE businesses
    ADD COLUMN IF NOT EXISTS ordering_config   JSONB        NOT NULL DEFAULT '{"allowed_fulfillment_types": ["dine_in"]}'::jsonb,
    ADD COLUMN IF NOT EXISTS bot_enabled       BOOLEAN      NOT NULL DEFAULT false;
