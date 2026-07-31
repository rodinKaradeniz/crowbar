-- Reservation protection is configured with the schedule so a booking type can
-- fully replace the business default, just as it does for hours and duration.
ALTER TABLE booking_schedules
    ADD COLUMN cancellation_window_minutes INTEGER NOT NULL DEFAULT 120,
    ADD COLUMN arrival_grace_period_minutes INTEGER NOT NULL DEFAULT 15,
    ADD COLUMN reminder_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN reminder_lead_minutes INTEGER NOT NULL DEFAULT 1440,
    ADD COLUMN reconfirmation_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    ADD CONSTRAINT ck_booking_schedules_cancellation_window_nonnegative
        CHECK (cancellation_window_minutes >= 0),
    ADD CONSTRAINT ck_booking_schedules_arrival_grace_nonnegative
        CHECK (arrival_grace_period_minutes >= 0),
    ADD CONSTRAINT ck_booking_schedules_reminder_lead_positive
        CHECK (reminder_lead_minutes > 0);

ALTER TABLE reservations
    ADD COLUMN guest_token_revision INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN cancelled_at TIMESTAMPTZ,
    ADD COLUMN cancelled_by VARCHAR(16),
    ADD COLUMN cancelled_late BOOLEAN,
    ADD COLUMN no_show_at TIMESTAMPTZ,
    ADD COLUMN no_show_by UUID REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN no_show_note TEXT,
    ADD COLUMN reconfirmed_at TIMESTAMPTZ,
    ADD CONSTRAINT ck_reservations_guest_token_revision_positive
        CHECK (guest_token_revision > 0),
    ADD CONSTRAINT ck_reservations_cancelled_by
        CHECK (cancelled_by IS NULL OR cancelled_by IN ('guest', 'staff')),
    ADD CONSTRAINT ck_reservations_cancelled_late
        CHECK (cancelled_late IS NULL OR cancelled_at IS NOT NULL),
    ADD CONSTRAINT ck_reservations_no_show_audit
        CHECK ((status = 'no_show') = (no_show_at IS NOT NULL));

CREATE INDEX idx_reservations_no_show_by ON reservations(no_show_by)
    WHERE no_show_by IS NOT NULL;

CREATE TABLE reservation_waitlist_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    service_type_id UUID NOT NULL REFERENCES service_types(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    requested_starts_at TIMESTAMPTZ NOT NULL,
    flexible_until TIMESTAMPTZ NOT NULL,
    guests INTEGER NOT NULL CHECK (guests > 0),
    status VARCHAR(16) NOT NULL DEFAULT 'waiting'
        CHECK (status IN ('waiting', 'offered', 'accepted', 'expired', 'removed')),
    offer_token_revision INTEGER NOT NULL DEFAULT 1 CHECK (offer_token_revision > 0),
    offered_at TIMESTAMPTZ,
    offered_reservation_time TIMESTAMPTZ,
    offer_expires_at TIMESTAMPTZ,
    accepted_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (flexible_until >= requested_starts_at),
    CHECK (
        (status <> 'offered' AND offer_expires_at IS NULL)
        OR (status = 'offered' AND offered_at IS NOT NULL AND offer_expires_at IS NOT NULL AND offered_reservation_time IS NOT NULL)
    )
);

CREATE INDEX idx_reservation_waitlist_eligible
    ON reservation_waitlist_entries(business_id, service_type_id, requested_starts_at)
    WHERE status = 'waiting';
