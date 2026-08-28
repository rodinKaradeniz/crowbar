-- One service-day queue policy, reasoned guest lifecycles, and a
-- generalized delivery audit shared by reservations, queue calls, and waitlist offers.

CREATE TABLE queue_service_days (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    location_id UUID NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
    service_date DATE NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'closed',
    max_waiting_covers INTEGER NOT NULL,
    changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    opened_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_queue_service_day_location_date
        UNIQUE (business_id, location_id, service_date),
    CONSTRAINT ck_queue_service_day_status CHECK (status IN ('open', 'closed')),
    CONSTRAINT ck_queue_service_day_capacity CHECK (max_waiting_covers > 0)
);
CREATE INDEX idx_queue_service_days_tenant_date
    ON queue_service_days (business_id, service_date DESC, location_id);
CREATE TRIGGER update_queue_service_days_updated_at
    BEFORE UPDATE ON queue_service_days
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE queue_entries
    ADD COLUMN service_date DATE,
    ADD COLUMN request_fingerprint VARCHAR(64),
    ADD COLUMN terminal_actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN terminal_reason_code VARCHAR(32),
    ADD COLUMN terminal_reason_note TEXT;

-- Old queue rows predate the required primary location. Use it where present,
-- but preserve a nullable legacy location rather than inventing one.
UPDATE queue_entries q
SET location_id = l.id
FROM locations l
WHERE q.location_id IS NULL
  AND l.business_id = q.business_id
  AND l.is_primary = TRUE;

UPDATE queue_entries q
SET service_date = (
    (q.joined_at AT TIME ZONE b.timezone)::date
    - CASE
        WHEN (q.joined_at AT TIME ZONE b.timezone)::time < b.service_day_cutoff
        THEN 1 ELSE 0
      END
)
FROM businesses b
WHERE b.id = q.business_id;

ALTER TABLE queue_entries ALTER COLUMN service_date SET NOT NULL;

DROP INDEX IF EXISTS idx_queue_entries_idempotency_key;
CREATE UNIQUE INDEX uq_queue_entries_business_idempotency_key
    ON queue_entries (business_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX uq_queue_entries_active_phone
    ON queue_entries (business_id, phone)
    WHERE phone IS NOT NULL AND status IN ('waiting', 'called');
DROP INDEX IF EXISTS idx_queue_entries_business_status;
CREATE INDEX idx_queue_entries_active_service_day
    ON queue_entries (business_id, location_id, service_date, status, joined_at);

CREATE TABLE queue_entry_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE RESTRICT,
    queue_entry_id UUID NOT NULL REFERENCES queue_entries(id) ON DELETE RESTRICT,
    event_type VARCHAR(32) NOT NULL,
    actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    reason_code VARCHAR(32),
    reason_note TEXT,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_queue_entry_events_tenant_entry_time
    ON queue_entry_events (business_id, queue_entry_id, occurred_at DESC);

ALTER TABLE reservation_delivery_attempts
    RENAME TO delivery_attempts;
ALTER TABLE delivery_attempts
    ALTER COLUMN reservation_id DROP NOT NULL,
    ADD COLUMN queue_entry_id UUID REFERENCES queue_entries(id) ON DELETE CASCADE,
    ADD COLUMN waitlist_entry_id UUID REFERENCES reservation_waitlist_entries(id) ON DELETE CASCADE;
ALTER TABLE delivery_attempts
    DROP CONSTRAINT uq_reservation_delivery_attempt_message_channel;
ALTER TABLE delivery_attempts
    ADD CONSTRAINT ck_delivery_attempt_exactly_one_target
        CHECK (num_nonnulls(reservation_id, queue_entry_id, waitlist_entry_id) = 1);
CREATE UNIQUE INDEX uq_delivery_attempt_reservation_message_channel
    ON delivery_attempts (reservation_id, message_kind, channel)
    WHERE reservation_id IS NOT NULL;
CREATE UNIQUE INDEX uq_delivery_attempt_queue_message_channel
    ON delivery_attempts (queue_entry_id, message_kind, channel)
    WHERE queue_entry_id IS NOT NULL;
CREATE UNIQUE INDEX uq_delivery_attempt_waitlist_message_channel
    ON delivery_attempts (waitlist_entry_id, message_kind, channel)
    WHERE waitlist_entry_id IS NOT NULL;
CREATE INDEX idx_delivery_attempts_queue_entry ON delivery_attempts(queue_entry_id)
    WHERE queue_entry_id IS NOT NULL;
CREATE INDEX idx_delivery_attempts_waitlist_entry ON delivery_attempts(waitlist_entry_id)
    WHERE waitlist_entry_id IS NOT NULL;

ALTER TABLE reservation_waitlist_entries
    DROP CONSTRAINT reservation_waitlist_entries_status_check,
    DROP CONSTRAINT reservation_waitlist_entries_check1,
    ADD COLUMN management_token_revision INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN idempotency_key VARCHAR(100),
    ADD COLUMN request_fingerprint VARCHAR(64),
    ADD COLUMN accepted_reservation_id UUID REFERENCES reservations(id) ON DELETE SET NULL,
    ADD COLUMN terminal_at TIMESTAMPTZ,
    ADD COLUMN terminal_actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN terminal_reason_code VARCHAR(32),
    ADD COLUMN terminal_reason_note TEXT,
    ADD CONSTRAINT ck_waitlist_status CHECK (
        status IN ('waiting', 'offered', 'accepted', 'declined', 'cancelled', 'expired', 'removed')
    ),
    ADD CONSTRAINT ck_waitlist_management_revision CHECK (management_token_revision > 0),
    ADD CONSTRAINT ck_waitlist_offer_state CHECK (
        (status = 'offered' AND offered_at IS NOT NULL
            AND offered_reservation_time IS NOT NULL AND offer_expires_at IS NOT NULL)
        OR status <> 'offered'
    );
CREATE UNIQUE INDEX uq_waitlist_business_idempotency_key
    ON reservation_waitlist_entries (business_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;
CREATE INDEX idx_waitlist_active
    ON reservation_waitlist_entries (business_id, requested_starts_at, created_at)
    WHERE status IN ('waiting', 'offered');
CREATE INDEX idx_waitlist_history
    ON reservation_waitlist_entries (business_id, terminal_at DESC, created_at DESC)
    WHERE status NOT IN ('waiting', 'offered');
CREATE INDEX idx_waitlist_expiry
    ON reservation_waitlist_entries (offer_expires_at)
    WHERE status = 'offered';
