-- Operational table-management foundation.
--
-- Turns the QR-oriented tables record into a location-aware operational
-- resource, adds areas and configured combinations, and separates advance
-- assignments from actual occupied seatings.

-- Every business needs a concrete primary location before operational tables
-- can be safely scoped. Preserve existing locations and promote the oldest one
-- only where no primary has been selected.
INSERT INTO locations (business_id, name, address, phone, is_primary)
SELECT b.id, b.name, b.address, b.phone, TRUE
FROM businesses b
WHERE NOT EXISTS (
    SELECT 1 FROM locations l WHERE l.business_id = b.id
);

WITH first_location AS (
    SELECT DISTINCT ON (l.business_id) l.id
    FROM locations l
    WHERE NOT EXISTS (
        SELECT 1
        FROM locations primary_location
        WHERE primary_location.business_id = l.business_id
          AND primary_location.is_primary = TRUE
    )
    ORDER BY l.business_id, l.created_at, l.id
)
UPDATE locations l
SET is_primary = TRUE
FROM first_location candidate
WHERE l.id = candidate.id;

-- Backfill the operational records that already carry the nullable location
-- foundation. Other modules keep their nullable columns until their own flows
-- become location-explicit.
UPDATE reservations r
SET location_id = l.id
FROM locations l
WHERE r.location_id IS NULL
  AND l.business_id = r.business_id
  AND l.is_primary = TRUE;

UPDATE queue_entries q
SET location_id = l.id
FROM locations l
WHERE q.location_id IS NULL
  AND l.business_id = q.business_id
  AND l.is_primary = TRUE;

ALTER TABLE queue_entries
    ADD COLUMN completed_at TIMESTAMPTZ;

UPDATE orders o
SET location_id = l.id
FROM locations l
WHERE o.location_id IS NULL
  AND l.business_id = o.business_id
  AND l.is_primary = TRUE;

UPDATE tables t
SET location_id = l.id
FROM locations l
WHERE t.location_id IS NULL
  AND l.business_id = t.business_id
  AND l.is_primary = TRUE;

CREATE TABLE table_areas (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    location_id UUID NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
    name        VARCHAR(100) NOT NULL,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    deleted_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_table_areas_active_name
    ON table_areas (business_id, location_id, LOWER(name))
    WHERE deleted_at IS NULL;
CREATE INDEX idx_table_areas_business_location
    ON table_areas (business_id, location_id)
    WHERE deleted_at IS NULL;

INSERT INTO table_areas (business_id, location_id, name)
SELECT l.business_id, l.id, 'Main Area'
FROM locations l;

ALTER TABLE tables
    ADD COLUMN area_id UUID REFERENCES table_areas(id) ON DELETE RESTRICT,
    ADD COLUMN shape VARCHAR(20) NOT NULL DEFAULT 'square',
    ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN operational_state VARCHAR(20) NOT NULL DEFAULT 'ready',
    ADD COLUMN operational_state_reason TEXT,
    ADD COLUMN operational_state_until TIMESTAMPTZ,
    ADD COLUMN operational_state_changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN operational_state_changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE tables t
SET area_id = a.id
FROM table_areas a
WHERE a.business_id = t.business_id
  AND a.location_id = t.location_id
  AND a.name = 'Main Area';

ALTER TABLE tables
    ALTER COLUMN location_id SET NOT NULL,
    ALTER COLUMN area_id SET NOT NULL,
    DROP CONSTRAINT tables_location_id_fkey,
    ADD CONSTRAINT tables_location_id_fkey
        FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE RESTRICT,
    ADD CONSTRAINT ck_tables_positive_capacity CHECK (capacity > 0),
    ADD CONSTRAINT ck_tables_shape
        CHECK (shape IN ('round', 'square', 'rectangle', 'bar', 'booth')),
    ADD CONSTRAINT ck_tables_operational_state
        CHECK (operational_state IN ('ready', 'cleaning', 'out_of_service'));

CREATE UNIQUE INDEX uq_tables_active_label
    ON tables (business_id, location_id, area_id, LOWER(label))
    WHERE deleted_at IS NULL;
CREATE INDEX idx_tables_operational_board
    ON tables (business_id, location_id, area_id, operational_state)
    WHERE deleted_at IS NULL AND is_active = TRUE;

CREATE TABLE table_combinations (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id       UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    location_id       UUID NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
    area_id           UUID NOT NULL REFERENCES table_areas(id) ON DELETE RESTRICT,
    name              VARCHAR(100) NOT NULL,
    capacity_override INTEGER,
    is_active         BOOLEAN NOT NULL DEFAULT TRUE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_table_combinations_positive_capacity
        CHECK (capacity_override IS NULL OR capacity_override > 0)
);

CREATE UNIQUE INDEX uq_table_combinations_name
    ON table_combinations (business_id, location_id, LOWER(name));

CREATE TABLE table_combination_members (
    combination_id UUID NOT NULL REFERENCES table_combinations(id) ON DELETE CASCADE,
    table_id       UUID NOT NULL REFERENCES tables(id) ON DELETE RESTRICT,
    PRIMARY KEY (combination_id, table_id)
);

CREATE INDEX idx_table_combination_members_table
    ON table_combination_members (table_id);

CREATE TABLE reservation_table_assignments (
    reservation_id          UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
    table_id                UUID NOT NULL REFERENCES tables(id) ON DELETE RESTRICT,
    business_id             UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    location_id             UUID NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
    assigned_by             UUID REFERENCES users(id) ON DELETE SET NULL,
    assigned_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    capacity_override_reason TEXT,
    PRIMARY KEY (reservation_id, table_id)
);

CREATE INDEX idx_reservation_table_assignments_table
    ON reservation_table_assignments (business_id, table_id, reservation_id);

CREATE TABLE queue_table_assignments (
    queue_entry_id          UUID NOT NULL REFERENCES queue_entries(id) ON DELETE CASCADE,
    table_id                UUID NOT NULL REFERENCES tables(id) ON DELETE RESTRICT,
    business_id             UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    location_id             UUID NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
    assigned_by             UUID REFERENCES users(id) ON DELETE SET NULL,
    assigned_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    capacity_override_reason TEXT,
    PRIMARY KEY (queue_entry_id, table_id)
);

CREATE INDEX idx_queue_table_assignments_table
    ON queue_table_assignments (business_id, table_id, queue_entry_id);

CREATE TABLE table_seatings (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id    UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    location_id    UUID NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
    reservation_id UUID REFERENCES reservations(id) ON DELETE RESTRICT,
    queue_entry_id UUID REFERENCES queue_entries(id) ON DELETE RESTRICT,
    party_size     INTEGER NOT NULL,
    status         VARCHAR(16) NOT NULL DEFAULT 'open',
    opened_by      UUID REFERENCES users(id) ON DELETE SET NULL,
    opened_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_by      UUID REFERENCES users(id) ON DELETE SET NULL,
    closed_at      TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_table_seatings_positive_party CHECK (party_size > 0),
    CONSTRAINT ck_table_seatings_status CHECK (status IN ('open', 'closed')),
    CONSTRAINT ck_table_seatings_one_source CHECK (
        (reservation_id IS NOT NULL)::INTEGER
        + (queue_entry_id IS NOT NULL)::INTEGER = 1
    )
);

CREATE UNIQUE INDEX uq_table_seatings_open_reservation
    ON table_seatings (reservation_id)
    WHERE status = 'open' AND reservation_id IS NOT NULL;
CREATE UNIQUE INDEX uq_table_seatings_open_queue
    ON table_seatings (queue_entry_id)
    WHERE status = 'open' AND queue_entry_id IS NOT NULL;
CREATE INDEX idx_table_seatings_board
    ON table_seatings (business_id, location_id, status);

CREATE TABLE table_seating_tables (
    seating_id UUID NOT NULL REFERENCES table_seatings(id) ON DELETE CASCADE,
    table_id   UUID NOT NULL REFERENCES tables(id) ON DELETE RESTRICT,
    PRIMARY KEY (seating_id, table_id)
);

CREATE INDEX idx_table_seating_tables_table
    ON table_seating_tables (table_id, seating_id);

DROP TRIGGER IF EXISTS trigger_update_table_areas_updated_at ON table_areas;
CREATE TRIGGER trigger_update_table_areas_updated_at
    BEFORE UPDATE ON table_areas
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_update_table_combinations_updated_at ON table_combinations;
CREATE TRIGGER trigger_update_table_combinations_updated_at
    BEFORE UPDATE ON table_combinations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_update_table_seatings_updated_at ON table_seatings;
CREATE TRIGGER trigger_update_table_seatings_updated_at
    BEFORE UPDATE ON table_seatings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
