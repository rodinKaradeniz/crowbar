-- Migration 023: Authoritative booking availability foundation
--
-- Operating hours remain public venue information. Booking schedules are a
-- separate, business-local source of truth with one business default and an
-- optional complete override per service type. A schedule with no windows is
-- intentionally closed: it never implies 24/7 availability.
--
-- Weekdays use the repository-wide convention 0=Monday..6=Sunday. TIME and
-- DATE values are interpreted in businesses.timezone by the availability
-- service; reservations themselves remain absolute TIMESTAMPTZ values.

-- A composite key lets the database reject a service-specific schedule whose
-- service type belongs to another tenant.
CREATE UNIQUE INDEX IF NOT EXISTS uq_service_types_id_business_id
    ON service_types(id, business_id);

CREATE TABLE booking_schedules (
    id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id              UUID        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    service_type_id          UUID,
    minimum_notice_minutes   INTEGER     NOT NULL DEFAULT 0
        CHECK (minimum_notice_minutes >= 0),
    advance_booking_days     INTEGER     NOT NULL DEFAULT 30
        CHECK (advance_booking_days > 0),
    slot_interval_minutes    INTEGER     NOT NULL DEFAULT 15
        CHECK (slot_interval_minutes > 0),
    default_duration_minutes INTEGER     NOT NULL DEFAULT 60
        CHECK (default_duration_minutes > 0),
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_booking_schedules_service_business
        FOREIGN KEY (service_type_id, business_id)
        REFERENCES service_types(id, business_id)
        ON DELETE CASCADE
);

CREATE UNIQUE INDEX uq_booking_schedules_business_default
    ON booking_schedules(business_id)
    WHERE service_type_id IS NULL;

CREATE UNIQUE INDEX uq_booking_schedules_service_override
    ON booking_schedules(service_type_id)
    WHERE service_type_id IS NOT NULL;

CREATE INDEX idx_booking_schedules_business
    ON booking_schedules(business_id);

CREATE TABLE booking_schedule_windows (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_id    UUID        NOT NULL REFERENCES booking_schedules(id) ON DELETE CASCADE,
    weekday        SMALLINT    NOT NULL CHECK (weekday BETWEEN 0 AND 6),
    start_time     TIME        NOT NULL,
    end_time       TIME        NOT NULL,
    ends_next_day  BOOLEAN     NOT NULL DEFAULT false,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_booking_schedule_windows_range CHECK (
        (NOT ends_next_day AND end_time > start_time)
        OR (ends_next_day AND end_time < start_time)
    ),
    CONSTRAINT uq_booking_schedule_windows_value
        UNIQUE (schedule_id, weekday, start_time, end_time, ends_next_day)
);

CREATE INDEX idx_booking_schedule_windows_schedule_weekday
    ON booking_schedule_windows(schedule_id, weekday);

CREATE TABLE booking_schedule_exceptions (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_id UUID        NOT NULL REFERENCES booking_schedules(id) ON DELETE CASCADE,
    local_date  DATE        NOT NULL,
    is_closed   BOOLEAN     NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_booking_schedule_exceptions_date
        UNIQUE (schedule_id, local_date)
);

CREATE INDEX idx_booking_schedule_exceptions_schedule_date
    ON booking_schedule_exceptions(schedule_id, local_date);

CREATE TABLE booking_schedule_exception_windows (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    exception_id   UUID        NOT NULL REFERENCES booking_schedule_exceptions(id) ON DELETE CASCADE,
    start_time     TIME        NOT NULL,
    end_time       TIME        NOT NULL,
    ends_next_day  BOOLEAN     NOT NULL DEFAULT false,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_booking_schedule_exception_windows_range CHECK (
        (NOT ends_next_day AND end_time > start_time)
        OR (ends_next_day AND end_time < start_time)
    ),
    CONSTRAINT uq_booking_schedule_exception_windows_value
        UNIQUE (exception_id, start_time, end_time, ends_next_day)
);

CREATE INDEX idx_booking_schedule_exception_windows_exception
    ON booking_schedule_exception_windows(exception_id);

CREATE TRIGGER update_booking_schedules_updated_at
    BEFORE UPDATE ON booking_schedules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_booking_schedule_windows_updated_at
    BEFORE UPDATE ON booking_schedule_windows
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_booking_schedule_exceptions_updated_at
    BEFORE UPDATE ON booking_schedule_exceptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_booking_schedule_exception_windows_updated_at
    BEFORE UPDATE ON booking_schedule_exception_windows
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Existing businesses receive a default policy even when they have no valid
-- operating-hour windows. No windows means no public availability.
INSERT INTO booking_schedules (
    business_id,
    minimum_notice_minutes,
    advance_booking_days,
    slot_interval_minutes,
    default_duration_minutes
)
SELECT
    b.id,
    0,
    GREATEST(COALESCE(b.advance_booking_days, 30), 1),
    GREATEST(COALESCE(b.time_slot_interval, 15), 1),
    GREATEST(COALESCE(b.reservation_time, 60), 1)
FROM businesses b;

-- Copy only structurally valid HH:MM[/SS] entries. Malformed legacy JSON is
-- ignored instead of aborting the migration. Equal open/close values are also
-- ignored because 24-hour availability must be configured explicitly later.
WITH parsed_hours AS (
    SELECT
        s.id AS schedule_id,
        CASE lower(hours.day_name)
            WHEN 'monday' THEN 0
            WHEN 'tuesday' THEN 1
            WHEN 'wednesday' THEN 2
            WHEN 'thursday' THEN 3
            WHEN 'friday' THEN 4
            WHEN 'saturday' THEN 5
            WHEN 'sunday' THEN 6
        END AS weekday,
        (hours.day_value ->> 'open')::time AS start_time,
        (hours.day_value ->> 'close')::time AS end_time
    FROM businesses b
    JOIN booking_schedules s
      ON s.business_id = b.id
     AND s.service_type_id IS NULL
    CROSS JOIN LATERAL jsonb_each(
        CASE
            WHEN jsonb_typeof(b.operating_hours) = 'object'
                THEN b.operating_hours
            ELSE '{}'::jsonb
        END
    )
        AS hours(day_name, day_value)
    WHERE jsonb_typeof(hours.day_value) = 'object'
      AND lower(hours.day_name) IN (
          'monday', 'tuesday', 'wednesday', 'thursday',
          'friday', 'saturday', 'sunday'
      )
      AND hours.day_value ->> 'closed' IS DISTINCT FROM 'true'
      AND hours.day_value ->> 'open'
          ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9](?::[0-5][0-9])?$'
      AND hours.day_value ->> 'close'
          ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9](?::[0-5][0-9])?$'
)
INSERT INTO booking_schedule_windows (
    schedule_id, weekday, start_time, end_time, ends_next_day
)
SELECT
    schedule_id,
    weekday,
    start_time,
    end_time,
    end_time < start_time
FROM parsed_hours
WHERE start_time <> end_time;

-- NULL historically meant "unspecified". The agreed safe legacy meaning is
-- one concurrent booking, not unlimited concurrency.
UPDATE service_types
SET max_concurrent_bookings = 1
WHERE max_concurrent_bookings IS NULL;

ALTER TABLE service_types
    ALTER COLUMN max_concurrent_bookings SET DEFAULT 1,
    ALTER COLUMN max_concurrent_bookings SET NOT NULL;

ALTER TABLE service_types
    ADD CONSTRAINT ck_service_types_max_concurrent_bookings_positive
    CHECK (max_concurrent_bookings > 0);

-- Persist the occupied interval so overlap checks and future resource
-- allocation do not have to reinterpret an old reservation using today's
-- duration settings.
ALTER TABLE reservations
    ADD COLUMN ends_at TIMESTAMPTZ,
    ADD COLUMN availability_override_by UUID REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN availability_override_reason TEXT,
    ADD COLUMN availability_overridden_at TIMESTAMPTZ;

UPDATE reservations r
SET ends_at = r.time + make_interval(
    mins => GREATEST(COALESCE(st.duration, b.reservation_time, 60), 1)
)
FROM service_types st, businesses b
WHERE st.id = r.service_type_id
  AND b.id = r.business_id;

ALTER TABLE reservations
    ALTER COLUMN ends_at SET NOT NULL,
    ADD CONSTRAINT ck_reservations_positive_interval CHECK (ends_at > time),
    ADD CONSTRAINT ck_reservations_override_audit CHECK (
        (availability_override_reason IS NULL AND availability_overridden_at IS NULL)
        OR
        (availability_override_reason IS NOT NULL AND availability_overridden_at IS NOT NULL)
    );

CREATE INDEX idx_reservations_active_overlap
    ON reservations(business_id, service_type_id, time, ends_at)
    WHERE status IN ('pending', 'confirmed');

-- Compatibility guard for an application instance still running code from
-- before this migration. New code supplies ends_at itself; this trigger only
-- derives it when omitted, or when legacy code changes time/service without
-- changing the existing end time.
CREATE OR REPLACE FUNCTION set_reservation_ends_at()
RETURNS TRIGGER AS $$
DECLARE
    duration_minutes INTEGER;
BEGIN
    IF NEW.ends_at IS NULL
       OR (
           TG_OP = 'UPDATE'
           AND (NEW.time IS DISTINCT FROM OLD.time
                OR NEW.service_type_id IS DISTINCT FROM OLD.service_type_id)
           AND NEW.ends_at IS NOT DISTINCT FROM OLD.ends_at
       )
    THEN
        SELECT GREATEST(COALESCE(st.duration, b.reservation_time, 60), 1)
          INTO duration_minutes
          FROM service_types st
          JOIN businesses b ON b.id = NEW.business_id
         WHERE st.id = NEW.service_type_id;

        NEW.ends_at := NEW.time + make_interval(
            mins => COALESCE(duration_minutes, 60)
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_reservations_ends_at
    BEFORE INSERT OR UPDATE OF time, service_type_id, ends_at
    ON reservations
    FOR EACH ROW EXECUTE FUNCTION set_reservation_ends_at();
