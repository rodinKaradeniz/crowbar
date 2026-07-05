-- ─── Seed: Puzzles Bar ────────────────────────────────────────────────────────
-- A craft cocktail bar used as a rich demo data source showcasing all platform
-- modules: reservations, queue, ordering, inventory, insights.
--
-- Staff : Jamie Cole (owner), Sam Rivers (manager), Alex Torres (staff)
-- Customers : 12 with diverse RFM profiles (champion/loyal/promising/at-risk/lost/new)
-- Password for all accounts: password123
-- bcrypt: $2b$12$pW/3qXilEy10Dn.jG4ymteWBBwUvvserWRoGHNiDs07taImefGwwK
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── Cleanup (idempotent re-run) ──────────────────────────────────────────────
-- Deleting the business cascades to every child table (staff, menus, orders,
-- inventory, queue, reservations, ml_predictions, daily_metrics, etc.)
DELETE FROM businesses WHERE id = '00000000-0000-0000-0000-000000000002';
-- Remove Puzzles users (safe after cascade removed all FK references)
DELETE FROM users WHERE id IN (
  '00000000-0000-0000-0002-000000000010',
  '00000000-0000-0000-0002-000000000011',
  '00000000-0000-0000-0002-000000000012',
  '00000000-0000-0000-0001-000000000010',
  '00000000-0000-0000-0001-000000000011',
  '00000000-0000-0000-0001-000000000012',
  '00000000-0000-0000-0001-000000000013',
  '00000000-0000-0000-0001-000000000014',
  '00000000-0000-0000-0001-000000000015',
  '00000000-0000-0000-0001-000000000016',
  '00000000-0000-0000-0001-000000000017',
  '00000000-0000-0000-0001-000000000018',
  '00000000-0000-0000-0001-000000000019',
  '00000000-0000-0000-0001-000000000020',
  '00000000-0000-0000-0001-000000000021'
);

-- ─── Business ─────────────────────────────────────────────────────────────────
INSERT INTO businesses (
  id, name, slug, email, phone, address, description, image, website, tags,
  max_guests, reservation_time, time_slot_interval, advance_booking_days,
  operating_hours, enabled_modules, onboarding_complete, notification_channels,
  is_accepting_orders
) VALUES (
  '00000000-0000-0000-0000-000000000002',
  'Puzzles',
  'puzzles',
  'hello@puzzlesbar.com',
  '+1-555-0200',
  '42 Riddle St, Brooklyn, NY 11201',
  'A neighbourhood craft cocktail bar. Inventive drinks, bar food worth staying for, and a vibe that''s more puzzle than pretence.',
  '/business-bar.jpg',
  '',
  ARRAY['Bar', 'Cocktails', 'Craft Beer', 'Bar Food', 'Nightlife'],
  8, 90, 30, 14,
  '{"monday":{"open":"17:00","close":"02:00"},"tuesday":{"open":"17:00","close":"02:00"},"wednesday":{"open":"17:00","close":"02:00"},"thursday":{"open":"17:00","close":"02:00"},"friday":{"open":"17:00","close":"02:00"},"saturday":{"open":"17:00","close":"02:00"},"sunday":{"open":"17:00","close":"02:00"}}',
  '["reservations","queue","ordering","inventory","insights"]'::jsonb,
  TRUE,
  '["email","sms"]'::jsonb,
  TRUE
);

-- ─── Staff Users ──────────────────────────────────────────────────────────────
INSERT INTO users (id, email, name, phone, password_hash, user_type, created_at) VALUES
('00000000-0000-0000-0002-000000000010', 'jamie@puzzlesbar.com', 'Jamie Cole',  '+1-555-0210', '$2b$12$pW/3qXilEy10Dn.jG4ymteWBBwUvvserWRoGHNiDs07taImefGwwK', 'staff', NOW() - INTERVAL '45 days'),
('00000000-0000-0000-0002-000000000011', 'sam@puzzlesbar.com',   'Sam Rivers',  '+1-555-0211', '$2b$12$pW/3qXilEy10Dn.jG4ymteWBBwUvvserWRoGHNiDs07taImefGwwK', 'staff', NOW() - INTERVAL '44 days'),
('00000000-0000-0000-0002-000000000012', 'alex@puzzlesbar.com',  'Alex Torres', '+1-555-0212', '$2b$12$pW/3qXilEy10Dn.jG4ymteWBBwUvvserWRoGHNiDs07taImefGwwK', 'staff', NOW() - INTERVAL '43 days');

INSERT INTO staff (id, user_id, business_id, role, created_at) VALUES
('00000000-0000-0000-0003-000000000010', '00000000-0000-0000-0002-000000000010', '00000000-0000-0000-0000-000000000002', 'owner',   NOW() - INTERVAL '45 days'),
('00000000-0000-0000-0003-000000000011', '00000000-0000-0000-0002-000000000011', '00000000-0000-0000-0000-000000000002', 'manager', NOW() - INTERVAL '44 days'),
('00000000-0000-0000-0003-000000000012', '00000000-0000-0000-0002-000000000012', '00000000-0000-0000-0000-000000000002', 'staff',   NOW() - INTERVAL '43 days');

-- ─── Customers ────────────────────────────────────────────────────────────────
-- Business-scoped customer identities (Phase 5.9: reservations.customer_id → customers).
-- Diverse RFM profiles: champions / loyal / promising / at-risk / lost / new
INSERT INTO customers (id, business_id, name, phone, email, created_at) VALUES
-- Champions (high recency, high frequency, regular in last 2 weeks)
('00000000-0000-0000-0001-000000000010', '00000000-0000-0000-0000-000000000002', 'Alex Morgan',   '+1-555-1010', 'alex.morgan@example.com',   NOW() - INTERVAL '42 days'),
('00000000-0000-0000-0001-000000000011', '00000000-0000-0000-0000-000000000002', 'Maria Santos',  '+1-555-1011', 'maria.santos@example.com',  NOW() - INTERVAL '38 days'),
('00000000-0000-0000-0001-000000000012', '00000000-0000-0000-0000-000000000002', 'Chris Patel',   '+1-555-1012', 'chris.patel@example.com',   NOW() - INTERVAL '35 days'),
-- Loyal (3-4 visits, last visit within 10 days)
('00000000-0000-0000-0001-000000000013', '00000000-0000-0000-0000-000000000002', 'Pat Kim',       '+1-555-1013', 'pat.kim@example.com',       NOW() - INTERVAL '30 days'),
('00000000-0000-0000-0001-000000000014', '00000000-0000-0000-0000-000000000002', 'Sam Lee',       '+1-555-1014', 'sam.lee@example.com',       NOW() - INTERVAL '25 days'),
-- Promising (1-2 visits, very recent)
('00000000-0000-0000-0001-000000000015', '00000000-0000-0000-0000-000000000002', 'Jordan Rivera', '+1-555-1015', 'jordan.rivera@example.com', NOW() - INTERVAL '12 days'),
('00000000-0000-0000-0001-000000000016', '00000000-0000-0000-0000-000000000002', 'Casey Chen',    '+1-555-1016', 'casey.chen@example.com',    NOW() - INTERVAL '9 days'),
-- At Risk (multiple visits, none in last 17+ days)
('00000000-0000-0000-0001-000000000017', '00000000-0000-0000-0000-000000000002', 'Taylor Brooks', '+1-555-1017', 'taylor.brooks@example.com', NOW() - INTERVAL '40 days'),
('00000000-0000-0000-0001-000000000018', '00000000-0000-0000-0000-000000000002', 'Morgan Davis',  '+1-555-1018', 'morgan.davis@example.com',  NOW() - INTERVAL '38 days'),
-- Needs Attention (was frequent, dormant 4+ weeks)
('00000000-0000-0000-0001-000000000019', '00000000-0000-0000-0000-000000000002', 'Riley Wilson',  '+1-555-1019', 'riley.wilson@example.com',  NOW() - INTERVAL '44 days'),
-- Lost (single visit 6 weeks ago, never returned)
('00000000-0000-0000-0001-000000000020', '00000000-0000-0000-0000-000000000002', 'Quinn Foster',  '+1-555-1020', 'quinn.foster@example.com',  NOW() - INTERVAL '44 days'),
-- New (first reservation is tomorrow)
('00000000-0000-0000-0001-000000000021', '00000000-0000-0000-0000-000000000002', 'Drew Nakamura', '+1-555-1021', 'drew.nakamura@example.com', NOW() - INTERVAL '1 day');

-- ─── Service Types ────────────────────────────────────────────────────────────
INSERT INTO service_types (
  id, business_id, name, description,
  capacity, max_concurrent_bookings,
  is_pending_enabled, duration, color, display_order, created_at
) VALUES
('00000000-0000-0000-0004-000000000010', '00000000-0000-0000-0000-000000000002',
  'Bar Seating',
  'Walk up to the bar or grab a stool — reserve your spot for the evening.',
  2, 4, FALSE, 45, '#f97316', 1, NOW() - INTERVAL '45 days'),
('00000000-0000-0000-0004-000000000011', '00000000-0000-0000-0000-000000000002',
  'Table Reservation',
  'Book a full table for groups. Manager will confirm within the hour.',
  6, 6, TRUE, 90, '#8b5cf6', 2, NOW() - INTERVAL '45 days');

-- ─── Cleanup: remove any out-of-hours reservations left by prior seeds ─────────
DELETE FROM reservations
WHERE business_id = '00000000-0000-0000-0000-000000000002'
  AND EXTRACT(HOUR FROM time AT TIME ZONE 'America/New_York') BETWEEN 3 AND 16;

-- ─── Reservations ─────────────────────────────────────────────────────────────
-- 38 total (34 original + 4 new upcoming): mostly completed, some confirmed, 2 cancelled
-- Times use (... AT TIME ZONE 'America/New_York') so hours are in NY local time
-- regardless of the PostgreSQL server timezone. Bar hours: 17:00–02:00 NY.
-- All reservation times fall between 19:00 and 22:30 NY (safely within hours).
--
-- Upcoming schedule (multiple bookings per day for a realistic schedule view):
--   +1 day : Drew Nakamura 20:00
--   +2 days: Jordan Rivera 19:00 · Casey Chen 20:00
--   +3 days: Alex Morgan 20:00 · Pat Kim 20:00 · Taylor Brooks 21:30
--   +5 days: Chris Patel 19:30
--   +7 days: Riley Wilson 19:00 · Sam Lee 21:00 · Morgan Davis 20:00
INSERT INTO reservations (id, business_id, customer_id, service_type_id, time, phone, email, note, status, guests, created_at) VALUES

-- Alex Morgan — Champion (3 completed, 1 upcoming confirmed HIGH RISK)
('00000000-0000-0000-0005-000000000001', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000010', '00000000-0000-0000-0004-000000000010',
  (DATE_TRUNC('day', NOW() AT TIME ZONE 'America/New_York') - INTERVAL '35 days' + INTERVAL '20 hours') AT TIME ZONE 'America/New_York',
  '+1-555-1010', 'alex.morgan@example.com', NULL, 'completed', 2, NOW() - INTERVAL '36 days'),
('00000000-0000-0000-0005-000000000002', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000010', '00000000-0000-0000-0004-000000000011',
  (DATE_TRUNC('day', NOW() AT TIME ZONE 'America/New_York') - INTERVAL '21 days' + INTERVAL '19 hours') AT TIME ZONE 'America/New_York',
  '+1-555-1010', 'alex.morgan@example.com', 'Birthday drinks for 4', 'completed', 4, NOW() - INTERVAL '22 days'),
('00000000-0000-0000-0005-000000000003', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000010', '00000000-0000-0000-0004-000000000010',
  (DATE_TRUNC('day', NOW() AT TIME ZONE 'America/New_York') - INTERVAL '7 days' + INTERVAL '21 hours') AT TIME ZONE 'America/New_York',
  '+1-555-1010', 'alex.morgan@example.com', NULL, 'completed', 2, NOW() - INTERVAL '8 days'),
('00000000-0000-0000-0005-000000000004', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000010', '00000000-0000-0000-0004-000000000010',
  (DATE_TRUNC('day', NOW() AT TIME ZONE 'America/New_York') + INTERVAL '3 days' + INTERVAL '20 hours') AT TIME ZONE 'America/New_York',
  '+1-555-1010', 'alex.morgan@example.com', NULL, 'confirmed', 2, NOW() - INTERVAL '1 day'),

-- Maria Santos — Champion (4 completed visits)
('00000000-0000-0000-0005-000000000005', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000011', '00000000-0000-0000-0004-000000000011',
  (DATE_TRUNC('day', NOW() AT TIME ZONE 'America/New_York') - INTERVAL '28 days' + INTERVAL '19 hours 30 minutes') AT TIME ZONE 'America/New_York',
  '+1-555-1011', 'maria.santos@example.com', 'Table for 3', 'completed', 3, NOW() - INTERVAL '29 days'),
('00000000-0000-0000-0005-000000000006', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000011', '00000000-0000-0000-0004-000000000010',
  (DATE_TRUNC('day', NOW() AT TIME ZONE 'America/New_York') - INTERVAL '14 days' + INTERVAL '20 hours') AT TIME ZONE 'America/New_York',
  '+1-555-1011', 'maria.santos@example.com', NULL, 'completed', 2, NOW() - INTERVAL '15 days'),
('00000000-0000-0000-0005-000000000007', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000011', '00000000-0000-0000-0004-000000000011',
  (DATE_TRUNC('day', NOW() AT TIME ZONE 'America/New_York') - INTERVAL '5 days' + INTERVAL '21 hours') AT TIME ZONE 'America/New_York',
  '+1-555-1011', 'maria.santos@example.com', 'Special occasion', 'completed', 4, NOW() - INTERVAL '6 days'),
('00000000-0000-0000-0005-000000000008', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000011', '00000000-0000-0000-0004-000000000010',
  (DATE_TRUNC('day', NOW() AT TIME ZONE 'America/New_York') - INTERVAL '1 day' + INTERVAL '22 hours') AT TIME ZONE 'America/New_York',
  '+1-555-1011', 'maria.santos@example.com', NULL, 'completed', 2, NOW() - INTERVAL '2 days'),

-- Chris Patel — Champion (3 completed, 1 upcoming confirmed HIGH RISK)
('00000000-0000-0000-0005-000000000009', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000012', '00000000-0000-0000-0004-000000000010',
  (DATE_TRUNC('day', NOW() AT TIME ZONE 'America/New_York') - INTERVAL '24 days' + INTERVAL '20 hours 30 minutes') AT TIME ZONE 'America/New_York',
  '+1-555-1012', 'chris.patel@example.com', NULL, 'completed', 2, NOW() - INTERVAL '25 days'),
('00000000-0000-0000-0005-000000000010', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000012', '00000000-0000-0000-0004-000000000011',
  (DATE_TRUNC('day', NOW() AT TIME ZONE 'America/New_York') - INTERVAL '14 days' + INTERVAL '19 hours') AT TIME ZONE 'America/New_York',
  '+1-555-1012', 'chris.patel@example.com', 'Work team drinks', 'completed', 6, NOW() - INTERVAL '15 days'),
('00000000-0000-0000-0005-000000000011', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000012', '00000000-0000-0000-0004-000000000010',
  (DATE_TRUNC('day', NOW() AT TIME ZONE 'America/New_York') - INTERVAL '7 days' + INTERVAL '20 hours') AT TIME ZONE 'America/New_York',
  '+1-555-1012', 'chris.patel@example.com', NULL, 'completed', 2, NOW() - INTERVAL '8 days'),
('00000000-0000-0000-0005-000000000012', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000012', '00000000-0000-0000-0004-000000000011',
  (DATE_TRUNC('day', NOW() AT TIME ZONE 'America/New_York') + INTERVAL '5 days' + INTERVAL '19 hours 30 minutes') AT TIME ZONE 'America/New_York',
  '+1-555-1012', 'chris.patel@example.com', 'Table for 5', 'confirmed', 5, NOW() - INTERVAL '1 day'),

-- Pat Kim — Loyal (2 completed, 1 upcoming confirmed)
('00000000-0000-0000-0005-000000000013', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000013', '00000000-0000-0000-0004-000000000011',
  (DATE_TRUNC('day', NOW() AT TIME ZONE 'America/New_York') - INTERVAL '21 days' + INTERVAL '19 hours') AT TIME ZONE 'America/New_York',
  '+1-555-1013', 'pat.kim@example.com', NULL, 'completed', 3, NOW() - INTERVAL '22 days'),
('00000000-0000-0000-0005-000000000014', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000013', '00000000-0000-0000-0004-000000000010',
  (DATE_TRUNC('day', NOW() AT TIME ZONE 'America/New_York') - INTERVAL '10 days' + INTERVAL '21 hours') AT TIME ZONE 'America/New_York',
  '+1-555-1013', 'pat.kim@example.com', NULL, 'completed', 2, NOW() - INTERVAL '11 days'),
('00000000-0000-0000-0005-000000000015', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000013', '00000000-0000-0000-0004-000000000011',
  (DATE_TRUNC('day', NOW() AT TIME ZONE 'America/New_York') + INTERVAL '3 days' + INTERVAL '20 hours') AT TIME ZONE 'America/New_York',
  '+1-555-1013', 'pat.kim@example.com', NULL, 'confirmed', 4, NOW() - INTERVAL '1 day'),

-- Sam Lee — Loyal (2 completed, 1 upcoming confirmed HIGH RISK)
('00000000-0000-0000-0005-000000000016', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000014', '00000000-0000-0000-0004-000000000010',
  (DATE_TRUNC('day', NOW() AT TIME ZONE 'America/New_York') - INTERVAL '18 days' + INTERVAL '20 hours') AT TIME ZONE 'America/New_York',
  '+1-555-1014', 'sam.lee@example.com', NULL, 'completed', 2, NOW() - INTERVAL '19 days'),
('00000000-0000-0000-0005-000000000017', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000014', '00000000-0000-0000-0004-000000000011',
  (DATE_TRUNC('day', NOW() AT TIME ZONE 'America/New_York') - INTERVAL '7 days' + INTERVAL '19 hours 30 minutes') AT TIME ZONE 'America/New_York',
  '+1-555-1014', 'sam.lee@example.com', NULL, 'completed', 3, NOW() - INTERVAL '8 days'),
('00000000-0000-0000-0005-000000000018', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000014', '00000000-0000-0000-0004-000000000010',
  (DATE_TRUNC('day', NOW() AT TIME ZONE 'America/New_York') + INTERVAL '7 days' + INTERVAL '21 hours') AT TIME ZONE 'America/New_York',
  '+1-555-1014', 'sam.lee@example.com', NULL, 'confirmed', 2, NOW()),

-- Jordan Rivera — Promising (2 completed, 1 upcoming confirmed)
('00000000-0000-0000-0005-000000000019', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000015', '00000000-0000-0000-0004-000000000010',
  (DATE_TRUNC('day', NOW() AT TIME ZONE 'America/New_York') - INTERVAL '10 days' + INTERVAL '21 hours') AT TIME ZONE 'America/New_York',
  '+1-555-1015', 'jordan.rivera@example.com', NULL, 'completed', 2, NOW() - INTERVAL '11 days'),
('00000000-0000-0000-0005-000000000020', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000015', '00000000-0000-0000-0004-000000000011',
  (DATE_TRUNC('day', NOW() AT TIME ZONE 'America/New_York') - INTERVAL '2 days' + INTERVAL '20 hours') AT TIME ZONE 'America/New_York',
  '+1-555-1015', 'jordan.rivera@example.com', NULL, 'completed', 3, NOW() - INTERVAL '3 days'),
('00000000-0000-0000-0005-000000000035', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000015', '00000000-0000-0000-0004-000000000010',
  (DATE_TRUNC('day', NOW() AT TIME ZONE 'America/New_York') + INTERVAL '2 days' + INTERVAL '19 hours') AT TIME ZONE 'America/New_York',
  '+1-555-1015', 'jordan.rivera@example.com', NULL, 'confirmed', 2, NOW()),

-- Casey Chen — Promising (1 completed, 1 upcoming confirmed)
('00000000-0000-0000-0005-000000000021', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000016', '00000000-0000-0000-0004-000000000010',
  (DATE_TRUNC('day', NOW() AT TIME ZONE 'America/New_York') - INTERVAL '8 days' + INTERVAL '22 hours') AT TIME ZONE 'America/New_York',
  '+1-555-1016', 'casey.chen@example.com', NULL, 'completed', 2, NOW() - INTERVAL '9 days'),
('00000000-0000-0000-0005-000000000022', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000016', '00000000-0000-0000-0004-000000000011',
  (DATE_TRUNC('day', NOW() AT TIME ZONE 'America/New_York') + INTERVAL '2 days' + INTERVAL '20 hours') AT TIME ZONE 'America/New_York',
  '+1-555-1016', 'casey.chen@example.com', 'Table for 4', 'confirmed', 4, NOW()),

-- Taylor Brooks — At Risk (3 completed, 1 cancelled, 1 upcoming confirmed)
('00000000-0000-0000-0005-000000000023', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000017', '00000000-0000-0000-0004-000000000011',
  (DATE_TRUNC('day', NOW() AT TIME ZONE 'America/New_York') - INTERVAL '36 days' + INTERVAL '20 hours') AT TIME ZONE 'America/New_York',
  '+1-555-1017', 'taylor.brooks@example.com', NULL, 'cancelled', 3, NOW() - INTERVAL '37 days'),
('00000000-0000-0000-0005-000000000024', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000017', '00000000-0000-0000-0004-000000000010',
  (DATE_TRUNC('day', NOW() AT TIME ZONE 'America/New_York') - INTERVAL '28 days' + INTERVAL '21 hours') AT TIME ZONE 'America/New_York',
  '+1-555-1017', 'taylor.brooks@example.com', NULL, 'completed', 2, NOW() - INTERVAL '29 days'),
('00000000-0000-0000-0005-000000000025', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000017', '00000000-0000-0000-0004-000000000011',
  (DATE_TRUNC('day', NOW() AT TIME ZONE 'America/New_York') - INTERVAL '22 days' + INTERVAL '20 hours') AT TIME ZONE 'America/New_York',
  '+1-555-1017', 'taylor.brooks@example.com', NULL, 'completed', 4, NOW() - INTERVAL '23 days'),
('00000000-0000-0000-0005-000000000026', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000017', '00000000-0000-0000-0004-000000000010',
  (DATE_TRUNC('day', NOW() AT TIME ZONE 'America/New_York') - INTERVAL '17 days' + INTERVAL '21 hours 30 minutes') AT TIME ZONE 'America/New_York',
  '+1-555-1017', 'taylor.brooks@example.com', NULL, 'completed', 2, NOW() - INTERVAL '18 days'),
('00000000-0000-0000-0005-000000000036', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000017', '00000000-0000-0000-0004-000000000010',
  (DATE_TRUNC('day', NOW() AT TIME ZONE 'America/New_York') + INTERVAL '3 days' + INTERVAL '21 hours 30 minutes') AT TIME ZONE 'America/New_York',
  '+1-555-1017', 'taylor.brooks@example.com', NULL, 'confirmed', 2, NOW()),

-- Morgan Davis — At Risk (2 completed, 1 cancelled, 1 upcoming confirmed)
('00000000-0000-0000-0005-000000000027', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000018', '00000000-0000-0000-0004-000000000010',
  (DATE_TRUNC('day', NOW() AT TIME ZONE 'America/New_York') - INTERVAL '28 days' + INTERVAL '22 hours') AT TIME ZONE 'America/New_York',
  '+1-555-1018', 'morgan.davis@example.com', NULL, 'cancelled', 2, NOW() - INTERVAL '29 days'),
('00000000-0000-0000-0005-000000000028', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000018', '00000000-0000-0000-0004-000000000011',
  (DATE_TRUNC('day', NOW() AT TIME ZONE 'America/New_York') - INTERVAL '22 days' + INTERVAL '20 hours') AT TIME ZONE 'America/New_York',
  '+1-555-1018', 'morgan.davis@example.com', NULL, 'completed', 3, NOW() - INTERVAL '23 days'),
('00000000-0000-0000-0005-000000000029', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000018', '00000000-0000-0000-0004-000000000010',
  (DATE_TRUNC('day', NOW() AT TIME ZONE 'America/New_York') - INTERVAL '17 days' + INTERVAL '21 hours') AT TIME ZONE 'America/New_York',
  '+1-555-1018', 'morgan.davis@example.com', NULL, 'completed', 2, NOW() - INTERVAL '18 days'),
('00000000-0000-0000-0005-000000000037', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000018', '00000000-0000-0000-0004-000000000011',
  (DATE_TRUNC('day', NOW() AT TIME ZONE 'America/New_York') + INTERVAL '7 days' + INTERVAL '20 hours') AT TIME ZONE 'America/New_York',
  '+1-555-1018', 'morgan.davis@example.com', NULL, 'confirmed', 3, NOW()),

-- Riley Wilson — Needs Attention (3 completed, 1 upcoming confirmed)
('00000000-0000-0000-0005-000000000030', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000019', '00000000-0000-0000-0004-000000000011',
  (DATE_TRUNC('day', NOW() AT TIME ZONE 'America/New_York') - INTERVAL '42 days' + INTERVAL '19 hours') AT TIME ZONE 'America/New_York',
  '+1-555-1019', 'riley.wilson@example.com', NULL, 'completed', 4, NOW() - INTERVAL '43 days'),
('00000000-0000-0000-0005-000000000031', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000019', '00000000-0000-0000-0004-000000000010',
  (DATE_TRUNC('day', NOW() AT TIME ZONE 'America/New_York') - INTERVAL '35 days' + INTERVAL '21 hours') AT TIME ZONE 'America/New_York',
  '+1-555-1019', 'riley.wilson@example.com', NULL, 'completed', 2, NOW() - INTERVAL '36 days'),
('00000000-0000-0000-0005-000000000032', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000019', '00000000-0000-0000-0004-000000000011',
  (DATE_TRUNC('day', NOW() AT TIME ZONE 'America/New_York') - INTERVAL '28 days' + INTERVAL '20 hours') AT TIME ZONE 'America/New_York',
  '+1-555-1019', 'riley.wilson@example.com', NULL, 'completed', 3, NOW() - INTERVAL '29 days'),
('00000000-0000-0000-0005-000000000038', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000019', '00000000-0000-0000-0004-000000000011',
  (DATE_TRUNC('day', NOW() AT TIME ZONE 'America/New_York') + INTERVAL '7 days' + INTERVAL '19 hours') AT TIME ZONE 'America/New_York',
  '+1-555-1019', 'riley.wilson@example.com', 'Birthday celebration', 'confirmed', 3, NOW()),

-- Quinn Foster — Lost (single visit 41 days ago)
('00000000-0000-0000-0005-000000000033', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000020', '00000000-0000-0000-0004-000000000010',
  (DATE_TRUNC('day', NOW() AT TIME ZONE 'America/New_York') - INTERVAL '41 days' + INTERVAL '21 hours') AT TIME ZONE 'America/New_York',
  '+1-555-1020', 'quinn.foster@example.com', NULL, 'completed', 2, NOW() - INTERVAL '42 days'),

-- Drew Nakamura — New (first reservation: tomorrow evening)
('00000000-0000-0000-0005-000000000034', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000021', '00000000-0000-0000-0004-000000000010',
  (DATE_TRUNC('day', NOW() AT TIME ZONE 'America/New_York') + INTERVAL '1 day' + INTERVAL '20 hours') AT TIME ZONE 'America/New_York',
  '+1-555-1021', 'drew.nakamura@example.com', NULL, 'confirmed', 2, NOW() - INTERVAL '1 hour');

-- ─── Menus ─────────────────────────────────────────────────────────────────────
INSERT INTO menus (id, business_id, name, description, is_active) VALUES
('00000000-0000-0000-0006-000000000001', '00000000-0000-0000-0000-000000000002', 'Happy Hour',   'Every day 5–8 PM. Reduced prices, good vibes.', TRUE),
('00000000-0000-0000-0006-000000000002', '00000000-0000-0000-0000-000000000002', 'Classic Menu', 'Our full offering, available all evening.',     TRUE);

-- ─── Menu Categories ──────────────────────────────────────────────────────────
INSERT INTO menu_categories (id, menu_id, business_id, name, display_order) VALUES
-- Happy Hour
('00000000-0000-0000-0007-000000000001', '00000000-0000-0000-0006-000000000001', '00000000-0000-0000-0000-000000000002', 'Cocktails', 1),
('00000000-0000-0000-0007-000000000002', '00000000-0000-0000-0006-000000000001', '00000000-0000-0000-0000-000000000002', 'Beers',     2),
('00000000-0000-0000-0007-000000000003', '00000000-0000-0000-0006-000000000001', '00000000-0000-0000-0000-000000000002', 'Bites',     3),
-- Classic Menu
('00000000-0000-0000-0007-000000000004', '00000000-0000-0000-0006-000000000002', '00000000-0000-0000-0000-000000000002', 'Cocktails', 1),
('00000000-0000-0000-0007-000000000005', '00000000-0000-0000-0006-000000000002', '00000000-0000-0000-0000-000000000002', 'Spirits',   2),
('00000000-0000-0000-0007-000000000006', '00000000-0000-0000-0006-000000000002', '00000000-0000-0000-0000-000000000002', 'Wine',      3),
('00000000-0000-0000-0007-000000000007', '00000000-0000-0000-0006-000000000002', '00000000-0000-0000-0000-000000000002', 'Bar Food',  4),
('00000000-0000-0000-0007-000000000008', '00000000-0000-0000-0006-000000000002', '00000000-0000-0000-0000-000000000002', 'Beers',     5);

-- ─── Menu Items (21) ──────────────────────────────────────────────────────────
INSERT INTO menu_items (id, category_id, business_id, name, description, price, is_available, routing_tag, prep_time_minutes, display_order) VALUES
-- Happy Hour: Cocktails
('00000000-0000-0000-0008-000000000001', '00000000-0000-0000-0007-000000000001', '00000000-0000-0000-0000-000000000002',
  'Happy Hour Mojito',  'Fresh mint, lime, white rum, soda. House special.',            9.00, TRUE, 'bar',     5, 1),
('00000000-0000-0000-0008-000000000002', '00000000-0000-0000-0007-000000000001', '00000000-0000-0000-0000-000000000002',
  'House Margarita',    'Tequila, triple sec, lime juice, salt rim.',                   9.00, TRUE, 'bar',     5, 2),
('00000000-0000-0000-0008-000000000003', '00000000-0000-0000-0007-000000000001', '00000000-0000-0000-0000-000000000002',
  'Gin & Tonic',        'House gin, premium tonic, lime, rosemary.',                    8.00, TRUE, 'bar',     3, 3),
-- Happy Hour: Beers
('00000000-0000-0000-0008-000000000004', '00000000-0000-0000-0007-000000000002', '00000000-0000-0000-0000-000000000002',
  'Draft Lager',        'Crisp local lager on tap.',                                    6.00, TRUE, 'bar',     2, 1),
('00000000-0000-0000-0008-000000000005', '00000000-0000-0000-0007-000000000002', '00000000-0000-0000-0000-000000000002',
  'IPA Pint',           'Hoppy East Coast IPA, poured fresh.',                          7.00, TRUE, 'bar',     2, 2),
-- Happy Hour: Bites
('00000000-0000-0000-0008-000000000006', '00000000-0000-0000-0007-000000000003', '00000000-0000-0000-0000-000000000002',
  'Happy Hour Wings',   '6 wings: buffalo, honey-garlic, or dry rub.',                10.00, TRUE, 'kitchen', 15, 1),
('00000000-0000-0000-0008-000000000007', '00000000-0000-0000-0007-000000000003', '00000000-0000-0000-0000-000000000002',
  'Nachos',             'Tortilla chips, cheddar, jalapeños, sour cream, salsa.',       9.00, TRUE, 'kitchen', 10, 2),
-- Classic Menu: Cocktails
('00000000-0000-0000-0008-000000000008', '00000000-0000-0000-0007-000000000004', '00000000-0000-0000-0000-000000000002',
  'Old Fashioned',      'Bourbon, angostura bitters, sugar, orange peel.',             13.00, TRUE, 'bar',     6, 1),
('00000000-0000-0000-0008-000000000009', '00000000-0000-0000-0007-000000000004', '00000000-0000-0000-0000-000000000002',
  'Negroni',            'Gin, Campari, sweet vermouth, orange twist.',                 13.00, TRUE, 'bar',     5, 2),
('00000000-0000-0000-0008-000000000010', '00000000-0000-0000-0007-000000000004', '00000000-0000-0000-0000-000000000002',
  'Espresso Martini',   'Vodka, espresso, Kahlua, sugar syrup. Crowd favourite.',      14.00, TRUE, 'bar',     6, 3),
('00000000-0000-0000-0008-000000000011', '00000000-0000-0000-0007-000000000004', '00000000-0000-0000-0000-000000000002',
  'Aperol Spritz',      'Aperol, Prosecco, soda, orange slice.',                       12.00, TRUE, 'bar',     4, 4),
('00000000-0000-0000-0008-000000000012', '00000000-0000-0000-0007-000000000004', '00000000-0000-0000-0000-000000000002',
  'Manhattan',          'Rye whisky, sweet vermouth, angostura, maraschino cherry.',   14.00, TRUE, 'bar',     6, 5),
-- Classic Menu: Spirits
('00000000-0000-0000-0008-000000000013', '00000000-0000-0000-0007-000000000005', '00000000-0000-0000-0000-000000000002',
  'Whisky Neat',        'Single pour of house blend whisky.',                          12.00, TRUE, 'bar',     2, 1),
('00000000-0000-0000-0008-000000000014', '00000000-0000-0000-0007-000000000005', '00000000-0000-0000-0000-000000000002',
  'Vodka Soda',         'Premium vodka with soda and lime.',                           10.00, TRUE, 'bar',     2, 2),
-- Classic Menu: Wine
('00000000-0000-0000-0008-000000000015', '00000000-0000-0000-0007-000000000006', '00000000-0000-0000-0000-000000000002',
  'House Red',          'Glass of Malbec. Smooth, fruit-forward.',                     11.00, TRUE, 'bar',     2, 1),
('00000000-0000-0000-0008-000000000016', '00000000-0000-0000-0007-000000000006', '00000000-0000-0000-0000-000000000002',
  'House White',        'Glass of Pinot Grigio. Crisp and dry.',                       11.00, TRUE, 'bar',     2, 2),
('00000000-0000-0000-0008-000000000017', '00000000-0000-0000-0007-000000000006', '00000000-0000-0000-0000-000000000002',
  'Prosecco',           'Glass of chilled Italian Prosecco.',                          12.00, TRUE, 'bar',     2, 3),
-- Classic Menu: Bar Food
('00000000-0000-0000-0008-000000000018', '00000000-0000-0000-0007-000000000007', '00000000-0000-0000-0000-000000000002',
  'Loaded Fries',       'Thick-cut fries, cheese sauce, bacon bits, chives.',          11.00, TRUE, 'kitchen', 12, 1),
('00000000-0000-0000-0008-000000000019', '00000000-0000-0000-0007-000000000007', '00000000-0000-0000-0000-000000000002',
  'Cheese Board',       'Selection of 3 cheeses, crackers, grapes, honey.',            16.00, TRUE, 'kitchen', 10, 2),
('00000000-0000-0000-0008-000000000020', '00000000-0000-0000-0007-000000000007', '00000000-0000-0000-0000-000000000002',
  'Beef Sliders',       'Two mini burgers, cheddar, pickles, special sauce.',          15.00, TRUE, 'kitchen', 15, 3),
-- Classic Menu: Beers
('00000000-0000-0000-0008-000000000021', '00000000-0000-0000-0007-000000000008', '00000000-0000-0000-0000-000000000002',
  'Classic Lager Pint', 'Full pour of our house lager.',                                7.00, TRUE, 'bar',     2, 1);

-- Mark alcoholic drinks (Age Verification demo). Cocktails, Beers, Spirits, and
-- Wine categories are alcoholic; Bites and Bar Food stay non-alcoholic.
UPDATE menu_items SET is_alcoholic = TRUE
WHERE category_id IN (
    '00000000-0000-0000-0007-000000000001',  -- Happy Hour: Cocktails
    '00000000-0000-0000-0007-000000000002',  -- Happy Hour: Beers
    '00000000-0000-0000-0007-000000000004',  -- Classic: Cocktails
    '00000000-0000-0000-0007-000000000005',  -- Classic: Spirits
    '00000000-0000-0000-0007-000000000006',  -- Classic: Wine
    '00000000-0000-0000-0007-000000000008'   -- Classic: Beers
);

-- ─── Item Library (mirror of all menu items) ──────────────────────────────────
INSERT INTO item_library (id, business_id, name, description, price, routing_tag, prep_time_minutes) VALUES
('00000000-0000-0000-0009-000000000001', '00000000-0000-0000-0000-000000000002', 'Happy Hour Mojito',  'Fresh mint, lime, white rum, soda. House special.',            9.00, 'bar',     5),
('00000000-0000-0000-0009-000000000002', '00000000-0000-0000-0000-000000000002', 'House Margarita',    'Tequila, triple sec, lime juice, salt rim.',                   9.00, 'bar',     5),
('00000000-0000-0000-0009-000000000003', '00000000-0000-0000-0000-000000000002', 'Gin & Tonic',        'House gin, premium tonic, lime, rosemary.',                    8.00, 'bar',     3),
('00000000-0000-0000-0009-000000000004', '00000000-0000-0000-0000-000000000002', 'Draft Lager',        'Crisp local lager on tap.',                                    6.00, 'bar',     2),
('00000000-0000-0000-0009-000000000005', '00000000-0000-0000-0000-000000000002', 'IPA Pint',           'Hoppy East Coast IPA, poured fresh.',                          7.00, 'bar',     2),
('00000000-0000-0000-0009-000000000006', '00000000-0000-0000-0000-000000000002', 'Happy Hour Wings',   '6 wings: buffalo, honey-garlic, or dry rub.',                10.00, 'kitchen', 15),
('00000000-0000-0000-0009-000000000007', '00000000-0000-0000-0000-000000000002', 'Nachos',             'Tortilla chips, cheddar, jalapeños, sour cream, salsa.',       9.00, 'kitchen', 10),
('00000000-0000-0000-0009-000000000008', '00000000-0000-0000-0000-000000000002', 'Old Fashioned',      'Bourbon, angostura bitters, sugar, orange peel.',             13.00, 'bar',     6),
('00000000-0000-0000-0009-000000000009', '00000000-0000-0000-0000-000000000002', 'Negroni',            'Gin, Campari, sweet vermouth, orange twist.',                 13.00, 'bar',     5),
('00000000-0000-0000-0009-000000000010', '00000000-0000-0000-0000-000000000002', 'Espresso Martini',   'Vodka, espresso, Kahlua, sugar syrup. Crowd favourite.',      14.00, 'bar',     6),
('00000000-0000-0000-0009-000000000011', '00000000-0000-0000-0000-000000000002', 'Aperol Spritz',      'Aperol, Prosecco, soda, orange slice.',                       12.00, 'bar',     4),
('00000000-0000-0000-0009-000000000012', '00000000-0000-0000-0000-000000000002', 'Manhattan',          'Rye whisky, sweet vermouth, angostura, maraschino cherry.',   14.00, 'bar',     6),
('00000000-0000-0000-0009-000000000013', '00000000-0000-0000-0000-000000000002', 'Whisky Neat',        'Single pour of house blend whisky.',                          12.00, 'bar',     2),
('00000000-0000-0000-0009-000000000014', '00000000-0000-0000-0000-000000000002', 'Vodka Soda',         'Premium vodka with soda and lime.',                           10.00, 'bar',     2),
('00000000-0000-0000-0009-000000000015', '00000000-0000-0000-0000-000000000002', 'House Red',          'Glass of Malbec. Smooth, fruit-forward.',                     11.00, 'bar',     2),
('00000000-0000-0000-0009-000000000016', '00000000-0000-0000-0000-000000000002', 'House White',        'Glass of Pinot Grigio. Crisp and dry.',                       11.00, 'bar',     2),
('00000000-0000-0000-0009-000000000017', '00000000-0000-0000-0000-000000000002', 'Prosecco',           'Glass of chilled Italian Prosecco.',                          12.00, 'bar',     2),
('00000000-0000-0000-0009-000000000018', '00000000-0000-0000-0000-000000000002', 'Loaded Fries',       'Thick-cut fries, cheese sauce, bacon bits, chives.',          11.00, 'kitchen', 12),
('00000000-0000-0000-0009-000000000019', '00000000-0000-0000-0000-000000000002', 'Cheese Board',       'Selection of 3 cheeses, crackers, grapes, honey.',            16.00, 'kitchen', 10),
('00000000-0000-0000-0009-000000000020', '00000000-0000-0000-0000-000000000002', 'Beef Sliders',       'Two mini burgers, cheddar, pickles, special sauce.',          15.00, 'kitchen', 15),
('00000000-0000-0000-0009-000000000021', '00000000-0000-0000-0000-000000000002', 'Classic Lager Pint', 'Full pour of our house lager.',                                7.00, 'bar',     2);

-- ─── Inventory Items ──────────────────────────────────────────────────────────
-- current_quantity is the exact sum of stock_movements.quantity_delta below.
-- IPA Keg is intentionally below par to demonstrate the low-stock alert.
INSERT INTO inventory_items (id, business_id, name, unit, current_quantity, par_quantity, cost_per_unit) VALUES
('00000000-0000-0000-0010-000000000001', '00000000-0000-0000-0000-000000000002', 'Whisky Blended',   'bottles',  18,   8,  38.00),  -- receive 24 − waste 6
('00000000-0000-0000-0010-000000000002', '00000000-0000-0000-0000-000000000002', 'Vodka Premium',    'bottles',  14,   6,  32.00),  -- receive 18 − waste 4
('00000000-0000-0000-0010-000000000003', '00000000-0000-0000-0000-000000000002', 'Rum Dark',         'bottles',   9,   4,  28.00),  -- receive 12 − waste 3
('00000000-0000-0000-0010-000000000004', '00000000-0000-0000-0000-000000000002', 'Gin London Dry',   'bottles',  10,   5,  35.00),  -- receive 15 − waste 5
('00000000-0000-0000-0010-000000000005', '00000000-0000-0000-0000-000000000002', 'Tequila Silver',   'bottles',   6,   3,  30.00),  -- receive 8 − waste 2
('00000000-0000-0000-0010-000000000006', '00000000-0000-0000-0000-000000000002', 'Red Wine',         'bottles',  16,   8,  18.00),  -- receive 24 − waste 8
('00000000-0000-0000-0010-000000000007', '00000000-0000-0000-0000-000000000002', 'White Wine',       'bottles',  14,   6,  16.00),  -- receive 20 − waste 6
('00000000-0000-0000-0010-000000000008', '00000000-0000-0000-0000-000000000002', 'Prosecco',         'bottles',   9,   4,  14.00),  -- receive 12 − waste 3
('00000000-0000-0000-0010-000000000009', '00000000-0000-0000-0000-000000000002', 'Lager Keg',        'kegs',      3,   2, 185.00),  -- receive 3
('00000000-0000-0000-0010-000000000010', '00000000-0000-0000-0000-000000000002', 'IPA Keg',          'kegs',      1,   2, 195.00),  -- receive 2 − waste 1 → BELOW PAR
('00000000-0000-0000-0010-000000000011', '00000000-0000-0000-0000-000000000002', 'Chicken Wings',    'kg',      3.5,   3,   9.50),  -- receive 5 − waste 1.5
('00000000-0000-0000-0010-000000000012', '00000000-0000-0000-0000-000000000002', 'Nachos Kit',       'kg',      3.5,   3,   6.00);  -- receive 4 − waste 0.5

-- ─── Stock Movements ──────────────────────────────────────────────────────────
INSERT INTO stock_movements (id, business_id, item_id, movement_type, quantity_delta, notes, created_by, alert_triggered, created_at) VALUES
-- Initial opening receive (6 weeks ago)
(gen_random_uuid(), '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0010-000000000001', 'receive',  24,   'Opening stock',              '00000000-0000-0000-0002-000000000010', FALSE, NOW() - INTERVAL '42 days'),
(gen_random_uuid(), '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0010-000000000002', 'receive',  18,   'Opening stock',              '00000000-0000-0000-0002-000000000010', FALSE, NOW() - INTERVAL '42 days'),
(gen_random_uuid(), '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0010-000000000003', 'receive',  12,   'Opening stock',              '00000000-0000-0000-0002-000000000010', FALSE, NOW() - INTERVAL '42 days'),
(gen_random_uuid(), '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0010-000000000004', 'receive',  15,   'Opening stock',              '00000000-0000-0000-0002-000000000010', FALSE, NOW() - INTERVAL '42 days'),
(gen_random_uuid(), '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0010-000000000005', 'receive',   8,   'Opening stock',              '00000000-0000-0000-0002-000000000010', FALSE, NOW() - INTERVAL '42 days'),
(gen_random_uuid(), '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0010-000000000006', 'receive',  24,   'Opening stock',              '00000000-0000-0000-0002-000000000010', FALSE, NOW() - INTERVAL '42 days'),
(gen_random_uuid(), '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0010-000000000007', 'receive',  20,   'Opening stock',              '00000000-0000-0000-0002-000000000010', FALSE, NOW() - INTERVAL '42 days'),
(gen_random_uuid(), '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0010-000000000008', 'receive',  12,   'Opening stock',              '00000000-0000-0000-0002-000000000010', FALSE, NOW() - INTERVAL '42 days'),
(gen_random_uuid(), '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0010-000000000009', 'receive',   3,   'Opening keg delivery',       '00000000-0000-0000-0002-000000000010', FALSE, NOW() - INTERVAL '42 days'),
(gen_random_uuid(), '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0010-000000000010', 'receive',   2,   'Opening keg delivery',       '00000000-0000-0000-0002-000000000010', FALSE, NOW() - INTERVAL '42 days'),
-- Weekly food delivery
(gen_random_uuid(), '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0010-000000000011', 'receive',   5,   'Weekly food delivery',       '00000000-0000-0000-0002-000000000011', FALSE, NOW() - INTERVAL '7 days'),
(gen_random_uuid(), '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0010-000000000012', 'receive',   4,   'Weekly food delivery',       '00000000-0000-0000-0002-000000000011', FALSE, NOW() - INTERVAL '7 days'),
-- Weekly usage waste adjustment
(gen_random_uuid(), '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0010-000000000001', 'waste',    -6,   'Weekly usage adjustment',    '00000000-0000-0000-0002-000000000012', FALSE, NOW() - INTERVAL '3 days'),
(gen_random_uuid(), '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0010-000000000002', 'waste',    -4,   'Weekly usage adjustment',    '00000000-0000-0000-0002-000000000012', FALSE, NOW() - INTERVAL '3 days'),
(gen_random_uuid(), '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0010-000000000003', 'waste',    -3,   'Weekly usage adjustment',    '00000000-0000-0000-0002-000000000012', FALSE, NOW() - INTERVAL '3 days'),
(gen_random_uuid(), '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0010-000000000004', 'waste',    -5,   'Weekly usage adjustment',    '00000000-0000-0000-0002-000000000012', FALSE, NOW() - INTERVAL '3 days'),
(gen_random_uuid(), '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0010-000000000005', 'waste',    -2,   'Weekly usage adjustment',    '00000000-0000-0000-0002-000000000012', FALSE, NOW() - INTERVAL '3 days'),
(gen_random_uuid(), '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0010-000000000006', 'waste',    -8,   'Weekly usage adjustment',    '00000000-0000-0000-0002-000000000012', FALSE, NOW() - INTERVAL '3 days'),
(gen_random_uuid(), '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0010-000000000007', 'waste',    -6,   'Weekly usage adjustment',    '00000000-0000-0000-0002-000000000012', FALSE, NOW() - INTERVAL '3 days'),
(gen_random_uuid(), '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0010-000000000008', 'waste',    -3,   'Weekly usage adjustment',    '00000000-0000-0000-0002-000000000012', FALSE, NOW() - INTERVAL '3 days'),
-- IPA keg waste causes par breach → alert_triggered = TRUE
(gen_random_uuid(), '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0010-000000000010', 'waste',    -1,   'Keg kicked — under par now', '00000000-0000-0000-0002-000000000012', TRUE,  NOW() - INTERVAL '1 day'),
-- Food waste
(gen_random_uuid(), '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0010-000000000011', 'waste',  -1.5,  'End-of-week food waste',      '00000000-0000-0000-0002-000000000011', FALSE, NOW() - INTERVAL '2 days'),
(gen_random_uuid(), '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0010-000000000012', 'waste',  -0.5,  'End-of-week food waste',      '00000000-0000-0000-0002-000000000011', FALSE, NOW() - INTERVAL '2 days');

-- ─── Orders (20 served, spread across 3 evenings) ─────────────────────────────
-- Evening 1: Friday -7 days (7 orders)
-- Evening 2: Saturday -6 days (8 orders)
-- Evening 3: Sunday -5 days (5 orders)
INSERT INTO orders (id, business_id, session_token, table_identifier, status, idempotency_key, total_amount, placed_at) VALUES
-- Friday evening
('00000000-0000-0000-0011-000000000001', '00000000-0000-0000-0000-000000000002', 'pzl-s-fri-001', 'T1', 'served', 'puzzles-order-fri-001', 37.00, DATE_TRUNC('day', NOW()) - INTERVAL '7 days' + INTERVAL '20 hours 15 minutes'),
('00000000-0000-0000-0011-000000000002', '00000000-0000-0000-0000-000000000002', 'pzl-s-fri-002', 'T2', 'served', 'puzzles-order-fri-002', 26.00, DATE_TRUNC('day', NOW()) - INTERVAL '7 days' + INTERVAL '20 hours 30 minutes'),
('00000000-0000-0000-0011-000000000003', '00000000-0000-0000-0000-000000000002', 'pzl-s-fri-003', 'T3', 'served', 'puzzles-order-fri-003', 37.00, DATE_TRUNC('day', NOW()) - INTERVAL '7 days' + INTERVAL '21 hours'),
('00000000-0000-0000-0011-000000000004', '00000000-0000-0000-0000-000000000002', 'pzl-s-fri-004', 'T4', 'served', 'puzzles-order-fri-004', 41.00, DATE_TRUNC('day', NOW()) - INTERVAL '7 days' + INTERVAL '21 hours 30 minutes'),
('00000000-0000-0000-0011-000000000005', '00000000-0000-0000-0000-000000000002', 'pzl-s-fri-005', 'T5', 'served', 'puzzles-order-fri-005', 38.00, DATE_TRUNC('day', NOW()) - INTERVAL '7 days' + INTERVAL '21 hours 45 minutes'),
('00000000-0000-0000-0011-000000000006', '00000000-0000-0000-0000-000000000002', 'pzl-s-fri-006', 'T1', 'served', 'puzzles-order-fri-006', 39.00, DATE_TRUNC('day', NOW()) - INTERVAL '7 days' + INTERVAL '22 hours 30 minutes'),
('00000000-0000-0000-0011-000000000007', '00000000-0000-0000-0000-000000000002', 'pzl-s-fri-007', 'T6', 'served', 'puzzles-order-fri-007', 42.00, DATE_TRUNC('day', NOW()) - INTERVAL '7 days' + INTERVAL '22 hours 45 minutes'),
-- Saturday evening
('00000000-0000-0000-0011-000000000008', '00000000-0000-0000-0000-000000000002', 'pzl-s-sat-001', 'T1', 'served', 'puzzles-order-sat-001', 33.00, DATE_TRUNC('day', NOW()) - INTERVAL '6 days' + INTERVAL '20 hours'),
('00000000-0000-0000-0011-000000000009', '00000000-0000-0000-0000-000000000002', 'pzl-s-sat-002', 'T2', 'served', 'puzzles-order-sat-002', 39.00, DATE_TRUNC('day', NOW()) - INTERVAL '6 days' + INTERVAL '20 hours 15 minutes'),
('00000000-0000-0000-0011-000000000010', '00000000-0000-0000-0000-000000000002', 'pzl-s-sat-003', 'T3', 'served', 'puzzles-order-sat-003', 44.00, DATE_TRUNC('day', NOW()) - INTERVAL '6 days' + INTERVAL '20 hours 45 minutes'),
('00000000-0000-0000-0011-000000000011', '00000000-0000-0000-0000-000000000002', 'pzl-s-sat-004', 'T4', 'served', 'puzzles-order-sat-004', 38.00, DATE_TRUNC('day', NOW()) - INTERVAL '6 days' + INTERVAL '21 hours'),
('00000000-0000-0000-0011-000000000012', '00000000-0000-0000-0000-000000000002', 'pzl-s-sat-005', 'T5', 'served', 'puzzles-order-sat-005', 41.00, DATE_TRUNC('day', NOW()) - INTERVAL '6 days' + INTERVAL '21 hours 30 minutes'),
('00000000-0000-0000-0011-000000000013', '00000000-0000-0000-0000-000000000002', 'pzl-s-sat-006', 'T6', 'served', 'puzzles-order-sat-006', 36.00, DATE_TRUNC('day', NOW()) - INTERVAL '6 days' + INTERVAL '21 hours 45 minutes'),
('00000000-0000-0000-0011-000000000014', '00000000-0000-0000-0000-000000000002', 'pzl-s-sat-007', 'T2', 'served', 'puzzles-order-sat-007', 39.00, DATE_TRUNC('day', NOW()) - INTERVAL '6 days' + INTERVAL '22 hours 15 minutes'),
('00000000-0000-0000-0011-000000000015', '00000000-0000-0000-0000-000000000002', 'pzl-s-sat-008', 'T7', 'served', 'puzzles-order-sat-008', 35.00, DATE_TRUNC('day', NOW()) - INTERVAL '6 days' + INTERVAL '22 hours 30 minutes'),
-- Sunday evening
('00000000-0000-0000-0011-000000000016', '00000000-0000-0000-0000-000000000002', 'pzl-s-sun-001', 'T1', 'served', 'puzzles-order-sun-001', 37.00, DATE_TRUNC('day', NOW()) - INTERVAL '5 days' + INTERVAL '20 hours'),
('00000000-0000-0000-0011-000000000017', '00000000-0000-0000-0000-000000000002', 'pzl-s-sun-002', 'T2', 'served', 'puzzles-order-sun-002', 36.00, DATE_TRUNC('day', NOW()) - INTERVAL '5 days' + INTERVAL '20 hours 30 minutes'),
('00000000-0000-0000-0011-000000000018', '00000000-0000-0000-0000-000000000002', 'pzl-s-sun-003', 'T3', 'served', 'puzzles-order-sun-003', 39.00, DATE_TRUNC('day', NOW()) - INTERVAL '5 days' + INTERVAL '21 hours'),
('00000000-0000-0000-0011-000000000019', '00000000-0000-0000-0000-000000000002', 'pzl-s-sun-004', 'T4', 'served', 'puzzles-order-sun-004', 38.00, DATE_TRUNC('day', NOW()) - INTERVAL '5 days' + INTERVAL '21 hours 30 minutes'),
('00000000-0000-0000-0011-000000000020', '00000000-0000-0000-0000-000000000002', 'pzl-s-sun-005', 'T5', 'served', 'puzzles-order-sun-005', 38.00, DATE_TRUNC('day', NOW()) - INTERVAL '5 days' + INTERVAL '22 hours');

-- ─── Order Line Items ─────────────────────────────────────────────────────────
INSERT INTO order_line_items (id, order_id, item_id, item_name, quantity, unit_price, routing_tag) VALUES
-- Order 1: Espresso Martini x2 + Nachos x1 = $37
(gen_random_uuid(), '00000000-0000-0000-0011-000000000001', '00000000-0000-0000-0008-000000000010', 'Espresso Martini',   2, 14.00, 'bar'),
(gen_random_uuid(), '00000000-0000-0000-0011-000000000001', '00000000-0000-0000-0008-000000000007', 'Nachos',             1,  9.00, 'kitchen'),
-- Order 2: Old Fashioned x2 = $26
(gen_random_uuid(), '00000000-0000-0000-0011-000000000002', '00000000-0000-0000-0008-000000000008', 'Old Fashioned',      2, 13.00, 'bar'),
-- Order 3: Happy Hour Mojito x3 + HH Wings x1 = $37
(gen_random_uuid(), '00000000-0000-0000-0011-000000000003', '00000000-0000-0000-0008-000000000001', 'Happy Hour Mojito',  3,  9.00, 'bar'),
(gen_random_uuid(), '00000000-0000-0000-0011-000000000003', '00000000-0000-0000-0008-000000000006', 'Happy Hour Wings',   1, 10.00, 'kitchen'),
-- Order 4: Negroni x2 + Beef Sliders x1 = $41
(gen_random_uuid(), '00000000-0000-0000-0011-000000000004', '00000000-0000-0000-0008-000000000009', 'Negroni',            2, 13.00, 'bar'),
(gen_random_uuid(), '00000000-0000-0000-0011-000000000004', '00000000-0000-0000-0008-000000000020', 'Beef Sliders',       1, 15.00, 'kitchen'),
-- Order 5: House Red x2 + Cheese Board x1 = $38
(gen_random_uuid(), '00000000-0000-0000-0011-000000000005', '00000000-0000-0000-0008-000000000015', 'House Red',          2, 11.00, 'bar'),
(gen_random_uuid(), '00000000-0000-0000-0011-000000000005', '00000000-0000-0000-0008-000000000019', 'Cheese Board',       1, 16.00, 'kitchen'),
-- Order 6: Manhattan x2 + Loaded Fries x1 = $39
(gen_random_uuid(), '00000000-0000-0000-0011-000000000006', '00000000-0000-0000-0008-000000000012', 'Manhattan',          2, 14.00, 'bar'),
(gen_random_uuid(), '00000000-0000-0000-0011-000000000006', '00000000-0000-0000-0008-000000000018', 'Loaded Fries',       1, 11.00, 'kitchen'),
-- Order 7: Espresso Martini x2 + IPA Pint x2 = $42
(gen_random_uuid(), '00000000-0000-0000-0011-000000000007', '00000000-0000-0000-0008-000000000010', 'Espresso Martini',   2, 14.00, 'bar'),
(gen_random_uuid(), '00000000-0000-0000-0011-000000000007', '00000000-0000-0000-0008-000000000005', 'IPA Pint',           2,  7.00, 'bar'),
-- Order 8: Aperol Spritz x2 + Nachos x1 = $33
(gen_random_uuid(), '00000000-0000-0000-0011-000000000008', '00000000-0000-0000-0008-000000000011', 'Aperol Spritz',      2, 12.00, 'bar'),
(gen_random_uuid(), '00000000-0000-0000-0011-000000000008', '00000000-0000-0000-0008-000000000007', 'Nachos',             1,  9.00, 'kitchen'),
-- Order 9: Old Fashioned x3 = $39
(gen_random_uuid(), '00000000-0000-0000-0011-000000000009', '00000000-0000-0000-0008-000000000008', 'Old Fashioned',      3, 13.00, 'bar'),
-- Order 10: Espresso Martini x2 + Cheese Board x1 = $44
(gen_random_uuid(), '00000000-0000-0000-0011-000000000010', '00000000-0000-0000-0008-000000000010', 'Espresso Martini',   2, 14.00, 'bar'),
(gen_random_uuid(), '00000000-0000-0000-0011-000000000010', '00000000-0000-0000-0008-000000000019', 'Cheese Board',       1, 16.00, 'kitchen'),
-- Order 11: Happy Hour Mojito x2 + HH Wings x2 = $38
(gen_random_uuid(), '00000000-0000-0000-0011-000000000011', '00000000-0000-0000-0008-000000000001', 'Happy Hour Mojito',  2,  9.00, 'bar'),
(gen_random_uuid(), '00000000-0000-0000-0011-000000000011', '00000000-0000-0000-0008-000000000006', 'Happy Hour Wings',   2, 10.00, 'kitchen'),
-- Order 12: Negroni x2 + Beef Sliders x1 = $41
(gen_random_uuid(), '00000000-0000-0000-0011-000000000012', '00000000-0000-0000-0008-000000000009', 'Negroni',            2, 13.00, 'bar'),
(gen_random_uuid(), '00000000-0000-0000-0011-000000000012', '00000000-0000-0000-0008-000000000020', 'Beef Sliders',       1, 15.00, 'kitchen'),
-- Order 13: Whisky Neat x3 = $36
(gen_random_uuid(), '00000000-0000-0000-0011-000000000013', '00000000-0000-0000-0008-000000000013', 'Whisky Neat',        3, 12.00, 'bar'),
-- Order 14: Manhattan x2 + Loaded Fries x1 = $39
(gen_random_uuid(), '00000000-0000-0000-0011-000000000014', '00000000-0000-0000-0008-000000000012', 'Manhattan',          2, 14.00, 'bar'),
(gen_random_uuid(), '00000000-0000-0000-0011-000000000014', '00000000-0000-0000-0008-000000000018', 'Loaded Fries',       1, 11.00, 'kitchen'),
-- Order 15: Prosecco x2 + House White x1 = $35
(gen_random_uuid(), '00000000-0000-0000-0011-000000000015', '00000000-0000-0000-0008-000000000017', 'Prosecco',           2, 12.00, 'bar'),
(gen_random_uuid(), '00000000-0000-0000-0011-000000000015', '00000000-0000-0000-0008-000000000016', 'House White',        1, 11.00, 'bar'),
-- Order 16: Espresso Martini x2 + Nachos x1 = $37
(gen_random_uuid(), '00000000-0000-0000-0011-000000000016', '00000000-0000-0000-0008-000000000010', 'Espresso Martini',   2, 14.00, 'bar'),
(gen_random_uuid(), '00000000-0000-0000-0011-000000000016', '00000000-0000-0000-0008-000000000007', 'Nachos',             1,  9.00, 'kitchen'),
-- Order 17: Old Fashioned x2 + HH Wings x1 = $36
(gen_random_uuid(), '00000000-0000-0000-0011-000000000017', '00000000-0000-0000-0008-000000000008', 'Old Fashioned',      2, 13.00, 'bar'),
(gen_random_uuid(), '00000000-0000-0000-0011-000000000017', '00000000-0000-0000-0008-000000000006', 'Happy Hour Wings',   1, 10.00, 'kitchen'),
-- Order 18: Gin & Tonic x3 + Beef Sliders x1 = $39
(gen_random_uuid(), '00000000-0000-0000-0011-000000000018', '00000000-0000-0000-0008-000000000003', 'Gin & Tonic',        3,  8.00, 'bar'),
(gen_random_uuid(), '00000000-0000-0000-0011-000000000018', '00000000-0000-0000-0008-000000000020', 'Beef Sliders',       1, 15.00, 'kitchen'),
-- Order 19: House Red x2 + Cheese Board x1 = $38
(gen_random_uuid(), '00000000-0000-0000-0011-000000000019', '00000000-0000-0000-0008-000000000015', 'House Red',          2, 11.00, 'bar'),
(gen_random_uuid(), '00000000-0000-0000-0011-000000000019', '00000000-0000-0000-0008-000000000019', 'Cheese Board',       1, 16.00, 'kitchen'),
-- Order 20: Negroni x2 + Draft Lager x2 = $38
(gen_random_uuid(), '00000000-0000-0000-0011-000000000020', '00000000-0000-0000-0008-000000000009', 'Negroni',            2, 13.00, 'bar'),
(gen_random_uuid(), '00000000-0000-0000-0011-000000000020', '00000000-0000-0000-0008-000000000004', 'Draft Lager',        2,  6.00, 'bar');

-- ─── Order Status Timeline ────────────────────────────────────────────────────
-- Each served order: received → preparing → ready → served
INSERT INTO order_status_timeline (id, order_id, status, changed_by, changed_at)
SELECT
  gen_random_uuid(),
  o.id,
  s.status,
  '00000000-0000-0000-0002-000000000012',  -- Alex Torres (staff)
  o.placed_at + s.offset_minutes * INTERVAL '1 minute'
FROM orders o
CROSS JOIN (
  VALUES ('received', 0), ('preparing', 2), ('ready', 10), ('served', 15)
) AS s(status, offset_minutes)
WHERE o.business_id = '00000000-0000-0000-0000-000000000002';

-- ─── Queue Entries (12 across 2 evenings) ─────────────────────────────────────
-- Friday -7 days: 5 entries (4 seated, 1 removed)
-- Saturday -6 days: 7 entries (4 seated, 3 removed)
INSERT INTO queue_entries (id, business_id, session_token, name, party_size, phone, status, joined_at, called_at, seated_at, removed_at) VALUES
-- Friday
('00000000-0000-0000-0013-000000000001', '00000000-0000-0000-0000-000000000002', 'pzl-q-fri-001', 'Mike Johnson',   3, '+1-555-2001', 'seated',
  DATE_TRUNC('day', NOW()) - INTERVAL '7 days' + INTERVAL '19 hours 30 minutes',
  DATE_TRUNC('day', NOW()) - INTERVAL '7 days' + INTERVAL '19 hours 45 minutes',
  DATE_TRUNC('day', NOW()) - INTERVAL '7 days' + INTERVAL '19 hours 50 minutes', NULL),
('00000000-0000-0000-0013-000000000002', '00000000-0000-0000-0000-000000000002', 'pzl-q-fri-002', 'Sarah Kim',      2, '+1-555-2002', 'seated',
  DATE_TRUNC('day', NOW()) - INTERVAL '7 days' + INTERVAL '19 hours 45 minutes',
  DATE_TRUNC('day', NOW()) - INTERVAL '7 days' + INTERVAL '20 hours 5 minutes',
  DATE_TRUNC('day', NOW()) - INTERVAL '7 days' + INTERVAL '20 hours 10 minutes', NULL),
('00000000-0000-0000-0013-000000000003', '00000000-0000-0000-0000-000000000002', 'pzl-q-fri-003', 'Tom Hayes',      4, '+1-555-2003', 'seated',
  DATE_TRUNC('day', NOW()) - INTERVAL '7 days' + INTERVAL '20 hours 15 minutes',
  DATE_TRUNC('day', NOW()) - INTERVAL '7 days' + INTERVAL '20 hours 30 minutes',
  DATE_TRUNC('day', NOW()) - INTERVAL '7 days' + INTERVAL '20 hours 35 minutes', NULL),
('00000000-0000-0000-0013-000000000004', '00000000-0000-0000-0000-000000000002', 'pzl-q-fri-004', 'Lisa Wu',        2, '+1-555-2004', 'removed',
  DATE_TRUNC('day', NOW()) - INTERVAL '7 days' + INTERVAL '20 hours 45 minutes',
  NULL, NULL,
  DATE_TRUNC('day', NOW()) - INTERVAL '7 days' + INTERVAL '21 hours'),
('00000000-0000-0000-0013-000000000005', '00000000-0000-0000-0000-000000000002', 'pzl-q-fri-005', 'Carlos Mendez',  3, '+1-555-2005', 'seated',
  DATE_TRUNC('day', NOW()) - INTERVAL '7 days' + INTERVAL '21 hours',
  DATE_TRUNC('day', NOW()) - INTERVAL '7 days' + INTERVAL '21 hours 15 minutes',
  DATE_TRUNC('day', NOW()) - INTERVAL '7 days' + INTERVAL '21 hours 20 minutes', NULL),
-- Saturday
('00000000-0000-0000-0013-000000000006', '00000000-0000-0000-0000-000000000002', 'pzl-q-sat-001', 'Emma Clarke',    4, '+1-555-2006', 'seated',
  DATE_TRUNC('day', NOW()) - INTERVAL '6 days' + INTERVAL '19 hours 15 minutes',
  DATE_TRUNC('day', NOW()) - INTERVAL '6 days' + INTERVAL '19 hours 35 minutes',
  DATE_TRUNC('day', NOW()) - INTERVAL '6 days' + INTERVAL '19 hours 40 minutes', NULL),
('00000000-0000-0000-0013-000000000007', '00000000-0000-0000-0000-000000000002', 'pzl-q-sat-002', 'Jake Novak',     2, '+1-555-2007', 'seated',
  DATE_TRUNC('day', NOW()) - INTERVAL '6 days' + INTERVAL '19 hours 30 minutes',
  DATE_TRUNC('day', NOW()) - INTERVAL '6 days' + INTERVAL '19 hours 50 minutes',
  DATE_TRUNC('day', NOW()) - INTERVAL '6 days' + INTERVAL '19 hours 55 minutes', NULL),
('00000000-0000-0000-0013-000000000008', '00000000-0000-0000-0000-000000000002', 'pzl-q-sat-003', 'Priya Singh',    3, '+1-555-2008', 'seated',
  DATE_TRUNC('day', NOW()) - INTERVAL '6 days' + INTERVAL '20 hours',
  DATE_TRUNC('day', NOW()) - INTERVAL '6 days' + INTERVAL '20 hours 15 minutes',
  DATE_TRUNC('day', NOW()) - INTERVAL '6 days' + INTERVAL '20 hours 20 minutes', NULL),
('00000000-0000-0000-0013-000000000009', '00000000-0000-0000-0000-000000000002', 'pzl-q-sat-004', 'Ben Chang',      2, '+1-555-2009', 'removed',
  DATE_TRUNC('day', NOW()) - INTERVAL '6 days' + INTERVAL '20 hours 30 minutes',
  NULL, NULL,
  DATE_TRUNC('day', NOW()) - INTERVAL '6 days' + INTERVAL '20 hours 45 minutes'),
('00000000-0000-0000-0013-000000000010', '00000000-0000-0000-0000-000000000002', 'pzl-q-sat-005', 'Olivia Scott',   5, '+1-555-2010', 'seated',
  DATE_TRUNC('day', NOW()) - INTERVAL '6 days' + INTERVAL '20 hours 45 minutes',
  DATE_TRUNC('day', NOW()) - INTERVAL '6 days' + INTERVAL '21 hours 5 minutes',
  DATE_TRUNC('day', NOW()) - INTERVAL '6 days' + INTERVAL '21 hours 10 minutes', NULL),
('00000000-0000-0000-0013-000000000011', '00000000-0000-0000-0000-000000000002', 'pzl-q-sat-006', 'Matt Zhou',      2, '+1-555-2011', 'removed',
  DATE_TRUNC('day', NOW()) - INTERVAL '6 days' + INTERVAL '21 hours 30 minutes',
  NULL, NULL,
  DATE_TRUNC('day', NOW()) - INTERVAL '6 days' + INTERVAL '21 hours 50 minutes'),
('00000000-0000-0000-0013-000000000012', '00000000-0000-0000-0000-000000000002', 'pzl-q-sat-007', 'Hannah Park',    3, '+1-555-2012', 'removed',
  DATE_TRUNC('day', NOW()) - INTERVAL '6 days' + INTERVAL '22 hours',
  NULL, NULL,
  DATE_TRUNC('day', NOW()) - INTERVAL '6 days' + INTERVAL '22 hours 15 minutes');

-- ─── ML Predictions: Cancellation Risk ────────────────────────────────────────
-- Pre-seeded so high-risk reservations appear in Insights without running ML.
-- model_name must be 'cancellation' (matches get_high_risk_reservations query).
-- Only upcoming confirmed reservations are relevant; >0.6 = shown in high-risk list.
INSERT INTO ml_predictions (id, business_id, model_name, model_version, entity_type, entity_id, prediction, computed_at) VALUES
-- HIGH RISK: Alex Morgan +3 days
(gen_random_uuid(), '00000000-0000-0000-0000-000000000002', 'cancellation', 'v1.2', 'reservation',
  '00000000-0000-0000-0005-000000000004',
  '{"cancellation_probability": 0.72, "risk_level": "high", "features": {"lead_time_hours": 72, "prior_cancellations": 0, "day_of_week": 3}}'::jsonb,
  NOW() - INTERVAL '6 hours'),
-- HIGH RISK: Chris Patel +5 days
(gen_random_uuid(), '00000000-0000-0000-0000-000000000002', 'cancellation', 'v1.2', 'reservation',
  '00000000-0000-0000-0005-000000000012',
  '{"cancellation_probability": 0.65, "risk_level": "high", "features": {"lead_time_hours": 120, "prior_cancellations": 0, "day_of_week": 5}}'::jsonb,
  NOW() - INTERVAL '6 hours'),
-- HIGH RISK: Sam Lee +7 days
(gen_random_uuid(), '00000000-0000-0000-0000-000000000002', 'cancellation', 'v1.2', 'reservation',
  '00000000-0000-0000-0005-000000000018',
  '{"cancellation_probability": 0.78, "risk_level": "high", "features": {"lead_time_hours": 168, "prior_cancellations": 0, "day_of_week": 0}}'::jsonb,
  NOW() - INTERVAL '6 hours'),
-- Medium risk: Pat Kim +3 days
(gen_random_uuid(), '00000000-0000-0000-0000-000000000002', 'cancellation', 'v1.2', 'reservation',
  '00000000-0000-0000-0005-000000000015',
  '{"cancellation_probability": 0.35, "risk_level": "medium", "features": {"lead_time_hours": 72, "prior_cancellations": 0, "day_of_week": 3}}'::jsonb,
  NOW() - INTERVAL '6 hours'),
-- Low risk: Casey Chen +2 days
(gen_random_uuid(), '00000000-0000-0000-0000-000000000002', 'cancellation', 'v1.2', 'reservation',
  '00000000-0000-0000-0005-000000000022',
  '{"cancellation_probability": 0.42, "risk_level": "medium", "features": {"lead_time_hours": 48, "prior_cancellations": 0, "day_of_week": 2}}'::jsonb,
  NOW() - INTERVAL '6 hours'),
-- Low risk: Drew Nakamura +1 day (new customer)
(gen_random_uuid(), '00000000-0000-0000-0000-000000000002', 'cancellation', 'v1.2', 'reservation',
  '00000000-0000-0000-0005-000000000034',
  '{"cancellation_probability": 0.28, "risk_level": "low", "features": {"lead_time_hours": 24, "prior_cancellations": 0, "day_of_week": 1}}'::jsonb,
  NOW() - INTERVAL '6 hours');

-- ─── Business Daily Metrics (42 days) ─────────────────────────────────────────
-- Used by the ML pipeline for forecasting. Weekend days have higher traffic.
INSERT INTO business_daily_metrics (
  id, business_id, date,
  total_reservations, completed_reservations, cancelled_reservations,
  no_show_count, total_guests, total_revenue,
  avg_lead_time_hours, peak_hour, utilization_rate
)
SELECT
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000002'::uuid,
  d::date,
  -- Weekend (Fri/Sat) peaks higher
  CASE WHEN EXTRACT(DOW FROM d) IN (5, 6) THEN 7 + (EXTRACT(DAY FROM d)::int % 4)
       WHEN EXTRACT(DOW FROM d) IN (0, 4) THEN 4 + (EXTRACT(DAY FROM d)::int % 3)
       ELSE 2 + (EXTRACT(DAY FROM d)::int % 2) END,
  CASE WHEN EXTRACT(DOW FROM d) IN (5, 6) THEN 6 + (EXTRACT(DAY FROM d)::int % 3)
       WHEN EXTRACT(DOW FROM d) IN (0, 4) THEN 3 + (EXTRACT(DAY FROM d)::int % 2)
       ELSE 1 + (EXTRACT(DAY FROM d)::int % 2) END,
  CASE WHEN EXTRACT(DOW FROM d) IN (5, 6) THEN 1
       ELSE 0 END,
  0,
  CASE WHEN EXTRACT(DOW FROM d) IN (5, 6) THEN (7 + (EXTRACT(DAY FROM d)::int % 4)) * 2 + 4
       WHEN EXTRACT(DOW FROM d) IN (0, 4) THEN (4 + (EXTRACT(DAY FROM d)::int % 3)) * 2 + 2
       ELSE (2 + (EXTRACT(DAY FROM d)::int % 2)) * 2 END,
  CASE WHEN EXTRACT(DOW FROM d) IN (5, 6) THEN 1200 + (EXTRACT(DAY FROM d)::int % 7) * 60
       WHEN EXTRACT(DOW FROM d) IN (0, 4) THEN 700 + (EXTRACT(DAY FROM d)::int % 5) * 50
       ELSE 350 + (EXTRACT(DAY FROM d)::int % 4) * 30 END,
  48 + (EXTRACT(DAY FROM d)::int % 24),
  21,
  CASE WHEN EXTRACT(DOW FROM d) IN (5, 6) THEN 0.75 + (EXTRACT(DAY FROM d)::int % 20) * 0.01
       WHEN EXTRACT(DOW FROM d) IN (0, 4) THEN 0.50 + (EXTRACT(DAY FROM d)::int % 20) * 0.01
       ELSE 0.25 + (EXTRACT(DAY FROM d)::int % 20) * 0.01 END
FROM generate_series(
  CURRENT_DATE - INTERVAL '41 days',
  CURRENT_DATE - INTERVAL '1 day',
  INTERVAL '1 day'
) d
ON CONFLICT (business_id, date) DO NOTHING;

-- ─── Pour/Keg Inventory + Recipes (Tier B / Phase 8 demo) ─────────────────────
-- The bottle/keg inventory rows above intentionally stay unit_type='each' (they
-- count whole bottles/kegs, unchanged). This block adds a few ml-tracked liquid
-- ingredients + a real recipe so auto-deduction, low-stock badges, and the
-- container-receive flow are demoable. See CLAUDE.md Non-Obvious "unit-type / ml".
INSERT INTO inventory_items
  (id, business_id, name, unit, unit_type, container_volume_ml, current_quantity, par_quantity, cost_per_unit) VALUES
-- White rum: 5 × 750 ml bottles received, ~1.5 bottles poured out → 2625 ml, below par.
('00000000-0000-0000-0010-000000000021', '00000000-0000-0000-0000-000000000002', 'White Rum (pour)',  'ml', 'bottle',   750,  2625, 3000, 0.04),
('00000000-0000-0000-0010-000000000022', '00000000-0000-0000-0000-000000000002', 'Lime Juice (pour)', 'ml', 'bottle',  1000,  4200, 2000, 0.01),
('00000000-0000-0000-0010-000000000023', '00000000-0000-0000-0000-000000000002', 'Soda Water (keg)',  'ml', 'keg',    20000, 15000, 8000, 0.002);

INSERT INTO stock_movements (id, business_id, item_id, movement_type, quantity_delta, notes, created_by, alert_triggered, created_at) VALUES
(gen_random_uuid(), '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0010-000000000021', 'receive',  3750, 'Received 5 bottles', '00000000-0000-0000-0002-000000000010', FALSE, NOW() - INTERVAL '14 days'),
(gen_random_uuid(), '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0010-000000000021', 'sale',    -1125, 'Weekend service pours', '00000000-0000-0000-0002-000000000010', TRUE,  NOW() - INTERVAL '2 days'),
(gen_random_uuid(), '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0010-000000000022', 'receive',  5000, 'Received 5 bottles', '00000000-0000-0000-0002-000000000010', FALSE, NOW() - INTERVAL '14 days'),
(gen_random_uuid(), '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0010-000000000022', 'sale',     -800, 'Weekend service pours', '00000000-0000-0000-0002-000000000010', FALSE, NOW() - INTERVAL '2 days'),
(gen_random_uuid(), '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0010-000000000023', 'receive', 20000, 'Received 1 keg',     '00000000-0000-0000-0002-000000000010', FALSE, NOW() - INTERVAL '14 days'),
(gen_random_uuid(), '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0010-000000000023', 'sale',    -5000, 'Weekend service pours', '00000000-0000-0000-0002-000000000010', FALSE, NOW() - INTERVAL '2 days');

-- Recipe for the Happy Hour Mojito: 50 ml rum, 25 ml lime, 100 ml soda.
-- (White Rum is below par → the Mojito shows a "low stock" badge in menu mgmt.)
INSERT INTO menu_item_ingredients (id, menu_item_id, inventory_item_id, quantity) VALUES
(gen_random_uuid(), '00000000-0000-0000-0008-000000000001', '00000000-0000-0000-0010-000000000021',  50),
(gen_random_uuid(), '00000000-0000-0000-0008-000000000001', '00000000-0000-0000-0010-000000000022',  25),
(gen_random_uuid(), '00000000-0000-0000-0008-000000000001', '00000000-0000-0000-0010-000000000023', 100);
