-- Seed: Businesses
-- Test data for development only

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM businesses LIMIT 1) THEN
    INSERT INTO businesses (id, name, slug, email, phone, address, description, image, website, tags, max_guests, reservation_time, time_slot_interval, advance_booking_days, operating_hours, created_at) VALUES
    (
      '00000000-0000-0000-0000-000000000001',
      'The Rustic Table',
      'the-rustic-table',
      'info@rustictable.com',
      '+1-555-0101',
      '123 Main Street, Downtown, State 12345',
      'Cozy restaurant and bar with a warm atmosphere, perfect for dinner and drinks',
      '/business-bar.jpg',
      'https://rustictable.com',
      ARRAY['Restaurant', 'Bar', 'Dinner', 'Drinks', 'Casual Dining'],
      20, 90, 15, 30,
      '{"monday": {"open": "11:00", "close": "23:00"}, "tuesday": {"open": "11:00", "close": "23:00"}, "wednesday": {"open": "11:00", "close": "23:00"}, "thursday": {"open": "11:00", "close": "23:00"}, "friday": {"open": "11:00", "close": "00:00"}, "saturday": {"open": "11:00", "close": "00:00"}, "sunday": {"open": "11:00", "close": "22:00"}}',
      '2024-01-15T10:00:00Z'
    ),
    (
      '00000000-0000-0000-0000-000000000002',
      'Grand Event Hall',
      'grand-event-hall',
      'events@grandhall.com',
      '+1-555-0201',
      '456 Event Boulevard, City, State 12345',
      'Spacious event venue perfect for parties, corporate events, and celebrations. Accommodates up to 50 guests with full catering and AV support.',
      '/business-venue.jpg',
      'https://grandhall.com',
      ARRAY['Event Space', 'Party Venue', 'Corporate Events', 'Weddings'],
      50, 240, 60, 180,
      '{"monday": {"open": "10:00", "close": "02:00"}, "tuesday": {"open": "10:00", "close": "02:00"}, "wednesday": {"open": "10:00", "close": "02:00"}, "thursday": {"open": "10:00", "close": "02:00"}, "friday": {"open": "10:00", "close": "02:00"}, "saturday": {"open": "10:00", "close": "02:00"}, "sunday": {"open": "10:00", "close": "02:00"}}',
      '2024-01-20T10:00:00Z'
    ),
    (
      '00000000-0000-0000-0000-000000000003',
      'Strategic Consulting',
      'strategic-consulting',
      'consult@strategic.com',
      '+1-555-0301',
      '789 Business Plaza, Suite 200, City, State 12345',
      'Professional business consulting services. Expert advice on strategy, financial planning, and business development.',
      '/business-consulting.jpg',
      'https://strategicconsulting.com',
      ARRAY['Consulting', 'Business Strategy', 'Financial Planning', 'Professional Services'],
      3, 90, 30, 60,
      '{"monday": {"open": "09:00", "close": "17:00"}, "tuesday": {"open": "09:00", "close": "17:00"}, "wednesday": {"open": "09:00", "close": "17:00"}, "thursday": {"open": "09:00", "close": "17:00"}, "friday": {"open": "09:00", "close": "17:00"}, "saturday": {"closed": true}, "sunday": {"closed": true}}',
      '2024-01-25T10:00:00Z'
    ),
    (
      '00000000-0000-0000-0000-000000000004',
      'Wellness Therapy Center',
      'wellness-therapy',
      'therapy@wellness.com',
      '+1-555-0401',
      '321 Wellness Way, Suite 100, City, State 12345',
      'Professional therapy services for individuals and couples. Safe, comfortable environment for personal growth and healing.',
      '/business-therapy.jpg',
      'https://wellnesstherapy.com',
      ARRAY['Therapy', 'Mental Health', 'Individual Therapy', 'Couples Therapy'],
      2, 90, 15, 90,
      '{"monday": {"open": "08:00", "close": "20:00"}, "tuesday": {"open": "08:00", "close": "20:00"}, "wednesday": {"open": "08:00", "close": "20:00"}, "thursday": {"open": "08:00", "close": "20:00"}, "friday": {"open": "08:00", "close": "20:00"}, "saturday": {"open": "09:00", "close": "16:00"}, "sunday": {"open": "10:00", "close": "14:00"}}',
      '2024-01-30T10:00:00Z'
    );
  END IF;
END $$;
