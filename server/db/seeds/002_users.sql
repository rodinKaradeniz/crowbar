-- Seed: Users (Customers + Staff users)
-- Test data for development only
-- Password for all users: password123
-- bcrypt hash of 'password123': $2b$12$pW/3qXilEy10Dn.jG4ymteWBBwUvvserWRoGHNiDs07taImefGwwK

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users LIMIT 1) THEN
    INSERT INTO users (id, email, name, phone, password_hash, user_type, created_at) VALUES
    -- Customers
    ('00000000-0000-0000-0001-000000000001', 'john.doe@example.com', 'John Doe', '+1-555-1001', '$2b$12$pW/3qXilEy10Dn.jG4ymteWBBwUvvserWRoGHNiDs07taImefGwwK', 'customer', '2024-02-01T10:00:00Z'),
    ('00000000-0000-0000-0001-000000000002', 'jane.smith@example.com', 'Jane Smith', '+1-555-1002', '$2b$12$pW/3qXilEy10Dn.jG4ymteWBBwUvvserWRoGHNiDs07taImefGwwK', 'customer', '2024-02-05T10:00:00Z'),
    ('00000000-0000-0000-0001-000000000003', 'mike.johnson@example.com', 'Mike Johnson', '+1-555-1003', '$2b$12$pW/3qXilEy10Dn.jG4ymteWBBwUvvserWRoGHNiDs07taImefGwwK', 'customer', '2024-02-10T10:00:00Z'),
    ('00000000-0000-0000-0001-000000000004', 'sarah.williams@example.com', 'Sarah Williams', '+1-555-1004', '$2b$12$pW/3qXilEy10Dn.jG4ymteWBBwUvvserWRoGHNiDs07taImefGwwK', 'customer', '2024-02-15T10:00:00Z'),
    ('00000000-0000-0000-0001-000000000005', 'david.brown@example.com', 'David Brown', '+1-555-1005', '$2b$12$pW/3qXilEy10Dn.jG4ymteWBBwUvvserWRoGHNiDs07taImefGwwK', 'customer', '2024-02-20T10:00:00Z'),
    -- Staff
    ('00000000-0000-0000-0002-000000000001', 'owner@rustictable.com', 'Maria Rodriguez', '+1-555-2001', '$2b$12$pW/3qXilEy10Dn.jG4ymteWBBwUvvserWRoGHNiDs07taImefGwwK', 'staff', '2024-01-15T10:00:00Z'),
    ('00000000-0000-0000-0002-000000000002', 'manager@rustictable.com', 'James Wilson', '+1-555-2002', '$2b$12$pW/3qXilEy10Dn.jG4ymteWBBwUvvserWRoGHNiDs07taImefGwwK', 'staff', '2024-01-16T10:00:00Z'),
    ('00000000-0000-0000-0002-000000000003', 'staff@rustictable.com', 'Emily Chen', '+1-555-2003', '$2b$12$pW/3qXilEy10Dn.jG4ymteWBBwUvvserWRoGHNiDs07taImefGwwK', 'staff', '2024-01-17T10:00:00Z'),
    ('00000000-0000-0000-0002-000000000004', 'owner@grandhall.com', 'Robert Thompson', '+1-555-2004', '$2b$12$pW/3qXilEy10Dn.jG4ymteWBBwUvvserWRoGHNiDs07taImefGwwK', 'staff', '2024-01-20T10:00:00Z'),
    ('00000000-0000-0000-0002-000000000005', 'manager@grandhall.com', 'Lisa Anderson', '+1-555-2005', '$2b$12$pW/3qXilEy10Dn.jG4ymteWBBwUvvserWRoGHNiDs07taImefGwwK', 'staff', '2024-01-21T10:00:00Z'),
    ('00000000-0000-0000-0002-000000000006', 'consultant@strategic.com', 'Dr. Michael Park', '+1-555-2006', '$2b$12$pW/3qXilEy10Dn.jG4ymteWBBwUvvserWRoGHNiDs07taImefGwwK', 'staff', '2024-01-25T10:00:00Z'),
    ('00000000-0000-0000-0002-000000000007', 'therapist@wellness.com', 'Dr. Sarah Johnson', '+1-555-2007', '$2b$12$pW/3qXilEy10Dn.jG4ymteWBBwUvvserWRoGHNiDs07taImefGwwK', 'staff', '2024-01-30T10:00:00Z');
  END IF;
END $$;
