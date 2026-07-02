-- 001_initial_schema.sql
-- Creates all tables for the Crowbar system

-- Track which migrations have been applied
CREATE TABLE IF NOT EXISTS _migrations (
    id SERIAL PRIMARY KEY,
    filename VARCHAR(255) NOT NULL UNIQUE,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Users (base table for customers and staff)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    avatar VARCHAR(500),
    password_hash VARCHAR(255) NOT NULL,
    user_type VARCHAR(20) NOT NULL CHECK (user_type IN ('customer', 'staff')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Businesses
CREATE TABLE IF NOT EXISTS businesses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(50) NOT NULL,
    address TEXT,
    description TEXT,
    image VARCHAR(500),
    website VARCHAR(500),
    tags TEXT[] DEFAULT '{}',
    max_guests INTEGER NOT NULL DEFAULT 10,
    reservation_time INTEGER NOT NULL DEFAULT 60,
    time_slot_interval INTEGER NOT NULL DEFAULT 15,
    advance_booking_days INTEGER NOT NULL DEFAULT 30,
    operating_hours JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Staff (links users to businesses with roles)
CREATE TABLE IF NOT EXISTS staff (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('owner', 'manager', 'staff')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, business_id)
);

-- Service Types (unified bookable items: tables, rooms, sessions, etc.)
CREATE TABLE IF NOT EXISTS service_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    capacity INTEGER NOT NULL DEFAULT 1,
    max_concurrent_bookings INTEGER,
    requires_payment BOOLEAN NOT NULL DEFAULT FALSE,
    amount DECIMAL(10, 2),
    duration INTEGER,
    color VARCHAR(20) NOT NULL DEFAULT '#3b82f6',
    display_order INTEGER,
    image VARCHAR(500),
    form_fields JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Reservations
CREATE TABLE IF NOT EXISTS reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    service_type_id UUID NOT NULL REFERENCES service_types(id) ON DELETE CASCADE,
    time TIMESTAMP WITH TIME ZONE NOT NULL,
    phone VARCHAR(50) NOT NULL,
    email VARCHAR(255) NOT NULL,
    note TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('confirmed', 'pending', 'cancelled', 'completed')),
    guests INTEGER NOT NULL DEFAULT 1,
    payment_amount DECIMAL(10, 2),
    payment_status VARCHAR(20)
        CHECK (payment_status IN ('pending', 'paid', 'refunded')),
    stripe_payment_intent_id VARCHAR(255),
    custom_fields JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_staff_user_id ON staff(user_id);
CREATE INDEX IF NOT EXISTS idx_staff_business_id ON staff(business_id);
CREATE INDEX IF NOT EXISTS idx_service_types_business_id ON service_types(business_id);
CREATE INDEX IF NOT EXISTS idx_reservations_business_id ON reservations(business_id);
CREATE INDEX IF NOT EXISTS idx_reservations_customer_id ON reservations(customer_id);
CREATE INDEX IF NOT EXISTS idx_reservations_service_type_id ON reservations(service_type_id);
CREATE INDEX IF NOT EXISTS idx_reservations_time ON reservations(time);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON reservations(status);
CREATE INDEX IF NOT EXISTS idx_businesses_slug ON businesses(slug);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOR tbl IN SELECT unnest(ARRAY['users', 'businesses', 'staff', 'service_types', 'reservations'])
    LOOP
        EXECUTE format(
            'DROP TRIGGER IF EXISTS trigger_update_%s_updated_at ON %I; 
             CREATE TRIGGER trigger_update_%s_updated_at 
             BEFORE UPDATE ON %I 
             FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();',
            tbl, tbl, tbl, tbl
        );
    END LOOP;
END $$;
