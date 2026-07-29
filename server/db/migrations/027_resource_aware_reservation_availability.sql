-- Resource-aware reservation availability. Existing service types retain the
-- legacy count guard until an owner configures a concrete resource policy.
ALTER TABLE service_types
    ADD COLUMN availability_resource_mode VARCHAR(16) NOT NULL DEFAULT 'legacy',
    ADD COLUMN reservable_cover_capacity INTEGER,
    ADD COLUMN resource_turn_buffer_minutes INTEGER NOT NULL DEFAULT 0;

ALTER TABLE service_types
    ADD CONSTRAINT ck_service_types_availability_resource_mode
        CHECK (availability_resource_mode IN ('legacy', 'tables', 'covers')),
    ADD CONSTRAINT ck_service_types_reservable_cover_capacity
        CHECK (
            (availability_resource_mode <> 'covers' AND reservable_cover_capacity IS NULL)
            OR reservable_cover_capacity > 0
        ),
    ADD CONSTRAINT ck_service_types_resource_turn_buffer_nonnegative
        CHECK (resource_turn_buffer_minutes >= 0);

-- This remains an optional operational guard for resource-backed services.
-- Legacy rows retain their existing positive values and therefore preserve the
-- prior availability behaviour until a manager completes resource setup.
ALTER TABLE service_types
    ALTER COLUMN max_concurrent_bookings DROP NOT NULL,
    ALTER COLUMN max_concurrent_bookings DROP DEFAULT;
