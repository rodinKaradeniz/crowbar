CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE orders
    ADD COLUMN request_fingerprint VARCHAR(64);

UPDATE orders
SET request_fingerprint = encode(
    digest(business_id::text || ':' || idempotency_key, 'sha256'),
    'hex'
)
WHERE request_fingerprint IS NULL;

ALTER TABLE orders
    ALTER COLUMN request_fingerprint SET NOT NULL;

ALTER TABLE orders
    DROP CONSTRAINT IF EXISTS orders_idempotency_key_key;

ALTER TABLE orders
    ADD CONSTRAINT uq_orders_business_idempotency_key
    UNIQUE (business_id, idempotency_key);

ALTER TABLE orders
    ADD CONSTRAINT ck_orders_total_nonnegative CHECK (total_amount >= 0);

ALTER TABLE order_line_items
    ADD CONSTRAINT ck_order_line_items_quantity_positive CHECK (quantity > 0),
    ADD CONSTRAINT ck_order_line_items_unit_price_nonnegative CHECK (unit_price >= 0);
