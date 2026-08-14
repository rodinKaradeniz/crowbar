UPDATE service_types
SET max_concurrent_bookings = 1
WHERE max_concurrent_bookings IS NULL
  AND availability_resource_mode = 'legacy';

ALTER TABLE service_types
    ALTER COLUMN max_concurrent_bookings SET DEFAULT 1;
