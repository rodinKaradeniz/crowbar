-- Seed: Single business for development
-- RK Design and Development - Software consultancy
-- Admin: Rodin Karadeniz (mrodin.karadeniz@gmail.com)
-- Password for all users: password123
-- bcrypt hash: $2b$12$pW/3qXilEy10Dn.jG4ymteWBBwUvvserWRoGHNiDs07taImefGwwK

-- Clear existing seed data (order respects foreign keys)
DELETE FROM reservations;
DELETE FROM service_types;
DELETE FROM staff;
DELETE FROM users;
DELETE FROM businesses;

-- Business: RK Design and Development
INSERT INTO businesses (id, name, slug, email, phone, address, description, image, website, tags, max_guests, reservation_time, time_slot_interval, advance_booking_days, operating_hours, created_at) VALUES
(
  '00000000-0000-0000-0000-000000000001',
  'RK Design and Development',
  'rk-design-and-development',
  'mrodin.karadeniz@gmail.com',
  '+1-555-0100',
  '',
  'Software consultancy. Expert advice on product design, development, and technical strategy.',
  '/business-consulting.jpg',
  '',
  ARRAY['Software', 'Consulting', 'Development', 'Design', 'Technical Strategy'],
  5, 60, 30, 60,
  '{"monday": {"open": "09:00", "close": "17:00"}, "tuesday": {"open": "09:00", "close": "17:00"}, "wednesday": {"open": "09:00", "close": "17:00"}, "thursday": {"open": "09:00", "close": "17:00"}, "friday": {"open": "09:00", "close": "17:00"}, "saturday": {"closed": true}, "sunday": {"closed": true}}',
  NOW()
);

-- Admin user (staff)
INSERT INTO users (id, email, name, phone, password_hash, user_type, created_at) VALUES
('00000000-0000-0000-0002-000000000001', 'mrodin.karadeniz@gmail.com', 'Rodin Karadeniz', NULL, '$2b$12$pW/3qXilEy10Dn.jG4ymteWBBwUvvserWRoGHNiDs07taImefGwwK', 'staff', NOW());

-- Staff assignment (owner)
INSERT INTO staff (id, user_id, business_id, role, created_at) VALUES
('00000000-0000-0000-0003-000000000001', '00000000-0000-0000-0002-000000000001', '00000000-0000-0000-0000-000000000001', 'owner', NOW());

-- Test customer (for reservation testing)
INSERT INTO users (id, email, name, phone, password_hash, user_type, created_at) VALUES
('00000000-0000-0000-0001-000000000001', 'test@example.com', 'Test Customer', '+1-555-1001', '$2b$12$pW/3qXilEy10Dn.jG4ymteWBBwUvvserWRoGHNiDs07taImefGwwK', 'customer', NOW());

-- Service types (software consultancy)
-- 30-min: online, no confirmation needed, no payment
-- 60-min: online, requires admin confirmation, no payment
-- 90-min: in-person, requires confirmation, payment required
INSERT INTO service_types (id, business_id, name, description, capacity, max_concurrent_bookings, requires_payment, amount, is_online, is_pending_enabled, duration, color, display_order, created_at) VALUES
('00000000-0000-0000-0004-000000000001', '00000000-0000-0000-0000-000000000001', '30-min Consultation', 'Quick discovery call', 3, 5, FALSE, NULL, TRUE, FALSE, 30, '#3b82f6', 1, NOW()),
('00000000-0000-0000-0004-000000000002', '00000000-0000-0000-0000-000000000001', '60-min Consultation', 'Standard consultation session', 3, 3, FALSE, NULL, TRUE, TRUE, 60, '#8b5cf6', 2, NOW()),
('00000000-0000-0000-0004-000000000003', '00000000-0000-0000-0000-000000000001', '90-min Workshop', 'Extended strategy session', 3, 2, TRUE, 200.00, FALSE, TRUE, 90, '#10b981', 3, NOW());
