-- Seed: Reservations
-- Test data for development only
-- Dates are relative to NOW() so data is always fresh

DO $$
DECLARE
  -- Base date helpers: today at midnight UTC
  today DATE := CURRENT_DATE;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM reservations LIMIT 1) THEN

    -- ═══════════════════════════════════════════════════════════════
    -- Yesterday (mix of completed and cancelled)
    -- ═══════════════════════════════════════════════════════════════
    INSERT INTO reservations (id, business_id, customer_id, service_type_id, time, phone, email, note, status, guests, payment_amount, payment_status, created_at) VALUES
    ('00000000-0000-0000-0005-000000000001', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0001-000000000001', '00000000-0000-0000-0004-000000000001',
      (today - INTERVAL '1 day') + INTERVAL '19 hours',
      '+1-555-1001', 'john.doe@example.com', 'Window seat preferred', 'completed', 4, NULL, NULL,
      (today - INTERVAL '8 days') + INTERVAL '10 hours'),

    ('00000000-0000-0000-0005-000000000002', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0001-000000000002', '00000000-0000-0000-0004-000000000002',
      (today - INTERVAL '1 day') + INTERVAL '20 hours',
      '+1-555-1002', 'jane.smith@example.com', 'Anniversary dinner', 'completed', 2, NULL, NULL,
      (today - INTERVAL '7 days') + INTERVAL '10 hours'),

    ('00000000-0000-0000-0005-000000000003', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0001-000000000003', '00000000-0000-0000-0004-000000000003',
      (today - INTERVAL '1 day') + INTERVAL '18 hours' + INTERVAL '30 minutes',
      '+1-555-1003', 'mike.johnson@example.com', NULL, 'cancelled', 1, NULL, NULL,
      (today - INTERVAL '6 days') + INTERVAL '10 hours'),

    ('00000000-0000-0000-0005-000000000004', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000001', '00000000-0000-0000-0004-000000000005',
      (today - INTERVAL '1 day') + INTERVAL '18 hours',
      '+1-555-1001', 'john.doe@example.com', 'Birthday party for 30 guests', 'completed', 30, 500.00, 'paid',
      (today - INTERVAL '14 days') + INTERVAL '10 hours'),

    ('00000000-0000-0000-0005-000000000005', '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0001-000000000003', '00000000-0000-0000-0004-000000000006',
      (today - INTERVAL '1 day') + INTERVAL '10 hours',
      '+1-555-1003', 'mike.johnson@example.com', 'Initial business strategy consultation', 'completed', 2, 75.00, 'paid',
      (today - INTERVAL '10 days') + INTERVAL '10 hours'),

    -- ═══════════════════════════════════════════════════════════════
    -- Today (confirmed reservations for today)
    -- ═══════════════════════════════════════════════════════════════
    ('00000000-0000-0000-0005-000000000006', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0001-000000000004', '00000000-0000-0000-0004-000000000001',
      today + INTERVAL '18 hours',
      '+1-555-1004', 'sarah.williams@example.com', 'Early dinner', 'confirmed', 3, NULL, NULL,
      (today - INTERVAL '5 days') + INTERVAL '10 hours'),

    ('00000000-0000-0000-0005-000000000007', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0001-000000000005', '00000000-0000-0000-0004-000000000002',
      today + INTERVAL '19 hours' + INTERVAL '30 minutes',
      '+1-555-1005', 'david.brown@example.com', NULL, 'confirmed', 2, NULL, NULL,
      (today - INTERVAL '4 days') + INTERVAL '10 hours'),

    ('00000000-0000-0000-0005-000000000008', '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0001-000000000004', '00000000-0000-0000-0004-000000000007',
      today + INTERVAL '14 hours',
      '+1-555-1004', 'sarah.williams@example.com', 'Financial planning session', 'confirmed', 1, 150.00, 'paid',
      (today - INTERVAL '6 days') + INTERVAL '10 hours'),

    ('00000000-0000-0000-0005-000000000009', '00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0001-000000000001', '00000000-0000-0000-0004-000000000009',
      today + INTERVAL '10 hours',
      '+1-555-1001', 'john.doe@example.com', NULL, 'confirmed', 1, 120.00, 'paid',
      (today - INTERVAL '5 days') + INTERVAL '10 hours'),

    ('00000000-0000-0000-0005-000000000010', '00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0001-000000000002', '00000000-0000-0000-0004-000000000010',
      today + INTERVAL '15 hours',
      '+1-555-1002', 'jane.smith@example.com', 'First couples session', 'confirmed', 2, 180.00, 'paid',
      (today - INTERVAL '4 days') + INTERVAL '10 hours'),

    -- ═══════════════════════════════════════════════════════════════
    -- Tomorrow (mix of confirmed and pending)
    -- ═══════════════════════════════════════════════════════════════
    ('00000000-0000-0000-0005-000000000011', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0001-000000000001', '00000000-0000-0000-0004-000000000004',
      (today + INTERVAL '1 day') + INTERVAL '19 hours' + INTERVAL '30 minutes',
      '+1-555-1001', 'john.doe@example.com', NULL, 'confirmed', 2, NULL, NULL,
      (today - INTERVAL '3 days') + INTERVAL '10 hours'),

    ('00000000-0000-0000-0005-000000000012', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000002', '00000000-0000-0000-0004-000000000005',
      (today + INTERVAL '1 day') + INTERVAL '19 hours',
      '+1-555-1002', 'jane.smith@example.com', 'Corporate team building event', 'pending', 45, NULL, NULL,
      (today - INTERVAL '2 days') + INTERVAL '10 hours'),

    ('00000000-0000-0000-0005-000000000013', '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0001-000000000005', '00000000-0000-0000-0004-000000000008',
      (today + INTERVAL '1 day') + INTERVAL '11 hours',
      '+1-555-1005', 'david.brown@example.com', NULL, 'pending', 3, NULL, NULL,
      (today - INTERVAL '1 day') + INTERVAL '10 hours'),

    ('00000000-0000-0000-0005-000000000014', '00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0001-000000000003', '00000000-0000-0000-0004-000000000009',
      (today + INTERVAL '1 day') + INTERVAL '11 hours',
      '+1-555-1003', 'mike.johnson@example.com', NULL, 'pending', 1, NULL, NULL,
      today + INTERVAL '8 hours'),

    -- ═══════════════════════════════════════════════════════════════
    -- Day after tomorrow (confirmed + pending)
    -- ═══════════════════════════════════════════════════════════════
    ('00000000-0000-0000-0005-000000000015', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0001-000000000005', '00000000-0000-0000-0004-000000000001',
      (today + INTERVAL '2 days') + INTERVAL '18 hours',
      '+1-555-1005', 'david.brown@example.com', 'Early dinner reservation', 'confirmed', 3, NULL, NULL,
      (today - INTERVAL '2 days') + INTERVAL '10 hours'),

    ('00000000-0000-0000-0005-000000000016', '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0001-000000000001', '00000000-0000-0000-0004-000000000006',
      (today + INTERVAL '2 days') + INTERVAL '9 hours',
      '+1-555-1001', 'john.doe@example.com', 'Follow-up consultation', 'confirmed', 1, 75.00, 'paid',
      (today - INTERVAL '1 day') + INTERVAL '10 hours'),

    ('00000000-0000-0000-0005-000000000017', '00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0001-000000000004', '00000000-0000-0000-0004-000000000010',
      (today + INTERVAL '2 days') + INTERVAL '14 hours',
      '+1-555-1004', 'sarah.williams@example.com', NULL, 'confirmed', 1, 120.00, 'paid',
      today + INTERVAL '9 hours'),

    -- ═══════════════════════════════════════════════════════════════
    -- 3 days from now (weekend-ish reservations)
    -- ═══════════════════════════════════════════════════════════════
    ('00000000-0000-0000-0005-000000000018', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0001-000000000002', '00000000-0000-0000-0004-000000000002',
      (today + INTERVAL '3 days') + INTERVAL '19 hours',
      '+1-555-1002', 'jane.smith@example.com', 'Weekend dinner', 'confirmed', 4, NULL, NULL,
      (today - INTERVAL '1 day') + INTERVAL '10 hours'),

    ('00000000-0000-0000-0005-000000000019', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0001-000000000003', '00000000-0000-0000-0004-000000000003',
      (today + INTERVAL '3 days') + INTERVAL '20 hours' + INTERVAL '30 minutes',
      '+1-555-1003', 'mike.johnson@example.com', NULL, 'pending', 2, NULL, NULL,
      today + INTERVAL '10 hours'),

    ('00000000-0000-0000-0005-000000000020', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000003', '00000000-0000-0000-0004-000000000005',
      (today + INTERVAL '3 days') + INTERVAL '18 hours',
      '+1-555-1003', 'mike.johnson@example.com', 'Saturday night party', 'confirmed', 50, 750.00, 'paid',
      (today - INTERVAL '3 days') + INTERVAL '10 hours'),

    ('00000000-0000-0000-0005-000000000021', '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0001-000000000002', '00000000-0000-0000-0004-000000000007',
      (today + INTERVAL '3 days') + INTERVAL '13 hours',
      '+1-555-1002', 'jane.smith@example.com', 'Business planning session', 'confirmed', 2, 150.00, 'paid',
      (today - INTERVAL '2 days') + INTERVAL '10 hours'),

    ('00000000-0000-0000-0005-000000000022', '00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0001-000000000005', '00000000-0000-0000-0004-000000000009',
      (today + INTERVAL '3 days') + INTERVAL '10 hours',
      '+1-555-1005', 'david.brown@example.com', NULL, 'confirmed', 1, 120.00, 'paid',
      (today - INTERVAL '1 day') + INTERVAL '10 hours'),

    ('00000000-0000-0000-0005-000000000023', '00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0001-000000000001', '00000000-0000-0000-0004-000000000010',
      (today + INTERVAL '3 days') + INTERVAL '16 hours',
      '+1-555-1001', 'john.doe@example.com', 'Follow-up session', 'pending', 1, NULL, NULL,
      today + INTERVAL '11 hours');

  END IF;
END $$;
