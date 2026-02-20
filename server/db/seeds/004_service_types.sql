-- Seed: Service Types
-- Test data for development only

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM service_types LIMIT 1) THEN
    INSERT INTO service_types (id, business_id, name, description, capacity, max_concurrent_bookings, requires_payment, amount, duration, color, display_order, created_at) VALUES
    -- The Rustic Table
    ('00000000-0000-0000-0004-000000000001', '00000000-0000-0000-0000-000000000001', 'Table (4-person)', 'Spacious table for up to 4 guests', 4, NULL, FALSE, NULL, NULL, '#3b82f6', 1, '2024-01-15T10:00:00Z'),
    ('00000000-0000-0000-0004-000000000002', '00000000-0000-0000-0000-000000000001', 'Table (2-person)', 'Intimate table for 2 guests', 2, NULL, FALSE, NULL, NULL, '#3b82f6', 2, '2024-01-15T10:00:00Z'),
    ('00000000-0000-0000-0004-000000000003', '00000000-0000-0000-0000-000000000001', 'Bar Seat (1-person)', 'Single seat at the bar', 1, NULL, FALSE, NULL, NULL, '#8b5cf6', 3, '2024-01-15T10:00:00Z'),
    ('00000000-0000-0000-0004-000000000004', '00000000-0000-0000-0000-000000000001', 'Bar Seat (2-person)', 'Two seats together at the bar', 2, NULL, FALSE, NULL, NULL, '#8b5cf6', 4, '2024-01-15T10:00:00Z'),
    -- Grand Event Hall
    ('00000000-0000-0000-0004-000000000005', '00000000-0000-0000-0000-000000000002', 'Main Hall', 'Large event space accommodating up to 50 guests', 50, NULL, TRUE, 500.00, NULL, '#10b981', 1, '2024-01-20T10:00:00Z'),
    -- Strategic Consulting
    ('00000000-0000-0000-0004-000000000006', '00000000-0000-0000-0000-000000000003', '30-min Consultation', 'Quick consultation session', 3, 5, TRUE, 75.00, 30, '#f59e0b', 1, '2024-01-25T10:00:00Z'),
    ('00000000-0000-0000-0004-000000000007', '00000000-0000-0000-0000-000000000003', '60-min Consultation', 'Standard consultation session', 3, 3, TRUE, 150.00, 60, '#f59e0b', 2, '2024-01-25T10:00:00Z'),
    ('00000000-0000-0000-0004-000000000008', '00000000-0000-0000-0000-000000000003', '90-min Consultation', 'Extended consultation session', 3, 2, TRUE, 200.00, 90, '#f59e0b', 3, '2024-01-25T10:00:00Z'),
    -- Wellness Therapy Center
    ('00000000-0000-0000-0004-000000000009', '00000000-0000-0000-0000-000000000004', 'Individual Therapy', 'One-on-one therapy session', 1, NULL, TRUE, 120.00, 60, '#06b6d4', 1, '2024-01-30T10:00:00Z'),
    ('00000000-0000-0000-0004-000000000010', '00000000-0000-0000-0000-000000000004', 'Couples Therapy', 'Therapy session for couples', 2, NULL, TRUE, 180.00, 90, '#a855f7', 2, '2024-01-30T10:00:00Z');
  END IF;
END $$;
