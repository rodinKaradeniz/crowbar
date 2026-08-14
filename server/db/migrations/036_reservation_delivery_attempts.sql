-- Record reservation-message delivery per channel so transient failures can be
-- retried without duplicating a channel that already succeeded.
CREATE TABLE IF NOT EXISTS reservation_delivery_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reservation_id UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    message_kind VARCHAR(32) NOT NULL,
    channel VARCHAR(16) NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'pending',
    attempt_count INTEGER NOT NULL DEFAULT 0,
    last_attempt_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_reservation_delivery_attempt_message_channel
        UNIQUE (reservation_id, message_kind, channel),
    CONSTRAINT ck_reservation_delivery_attempt_channel
        CHECK (channel IN ('email', 'sms')),
    CONSTRAINT ck_reservation_delivery_attempt_status
        CHECK (status IN ('pending', 'failed', 'delivered')),
    CONSTRAINT ck_reservation_delivery_attempt_count
        CHECK (attempt_count >= 0)
);

CREATE INDEX IF NOT EXISTS ix_reservation_delivery_attempts_reservation_id
    ON reservation_delivery_attempts (reservation_id);
CREATE INDEX IF NOT EXISTS ix_reservation_delivery_attempts_business_id
    ON reservation_delivery_attempts (business_id);
