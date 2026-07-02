-- Migration 016: Tabs (Phase B.1)
-- An open, appendable tab groups multiple discrete orders under one running
-- total, closed out with a simulated settlement (settled_method). There is NO
-- payment processing behind settled_method — closing a tab is a status change
-- plus a stored method value, matching the deferred-payments stance (Phase 10).
--
-- Tabs are additive: orders with tab_id NULL behave exactly as before. The tab
-- total is computed on demand (SUM over the tab's associated orders) — there is
-- deliberately no denormalized running_total column.

CREATE TABLE IF NOT EXISTS tabs (
    id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id    UUID         NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    table_id       UUID         REFERENCES tables(id) ON DELETE SET NULL,
    customer_id    UUID         REFERENCES customers(id) ON DELETE SET NULL,
    status         VARCHAR(16)  NOT NULL DEFAULT 'open',   -- 'open' | 'closed'
    channel        VARCHAR(16)  NOT NULL DEFAULT 'staff',  -- qr | whatsapp | chatbot | web | staff
    opened_by      UUID         NOT NULL REFERENCES users(id),
    opened_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    closed_by      UUID         REFERENCES users(id),
    closed_at      TIMESTAMPTZ,
    settled_method VARCHAR(16),                            -- 'cash' | 'card' | 'comp' | 'other'
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tabs_business_status
    ON tabs(business_id, status);

CREATE TRIGGER update_tabs_updated_at
    BEFORE UPDATE ON tabs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Orders may belong to a tab. Nullable: NULL = standalone order (unchanged).
ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS tab_id UUID REFERENCES tabs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_tab
    ON orders(tab_id)
    WHERE tab_id IS NOT NULL;
