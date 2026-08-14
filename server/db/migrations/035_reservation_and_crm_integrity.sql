ALTER TABLE reservations
    ADD COLUMN request_fingerprint VARCHAR(64);

DROP INDEX IF EXISTS idx_reservations_idempotency_key;

CREATE UNIQUE INDEX uq_reservations_business_idempotency_key
    ON reservations (business_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

ALTER TABLE reservations
    ADD CONSTRAINT ck_reservations_public_idempotency_fingerprint CHECK (
        (idempotency_key IS NULL AND request_fingerprint IS NULL)
        OR (idempotency_key IS NOT NULL AND request_fingerprint IS NOT NULL)
    );
