-- ─── Seed: Volt & Vine ───────────────────────────────────────────────────────
-- A wholly synthetic bar used as a rich demo data source showcasing all platform
-- modules: reservations, queue, floor, ordering, tabs, inventory, insights.
--
-- "Volt & Vine" is an invented venue and reads like a real one, which the
-- previous name ("Example Lantern") did not. Nothing in the name now signals
-- that this data is fake, so the guarantee rests entirely on two things below:
-- every address is @example.com, and this header. Neither is decoration. If you
-- add a section, keep both true.
--
-- Staff : one account per pilot role — owner, manager, host/server, bar/kitchen,
--         inventory operator
-- Customers : 12 with diverse RFM profiles (champion/loyal/promising/at-risk/lost/new)
-- Floor : one primary location, three areas, 20 tables, two combinations, and
--         the Bar and Kitchen preparation stations
--
-- No password is written here, and none may be. The runner substitutes a bcrypt
-- hash for __DEMO_PASSWORD_HASH__ at run time. DEMO_ADMIN_PASSWORD chooses the
-- password it hashes; it is optional, and when it is unset the runner falls back
-- to a known weak local-only one and prints it once seeding finishes. Secrecy is
-- therefore not what protects this — the local-host guard in db/migrate.py is,
-- because it refuses to seed anything but a local disposable database.
--
-- Every address uses @example.com, reserved by RFC 2606 for documentation and
-- owned by no one, so demo data can never reach a real mailbox. Do not switch
-- to a reserved special-use TLD such as .invalid: those are non-deliverable but
-- Pydantic's EmailStr rejects them, which makes every seeded account unable to
-- log in.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── Cleanup (idempotent re-run) ──────────────────────────────────────────────
-- Five tables hold business_id ON DELETE RESTRICT rather than CASCADE, so that a
-- settlement, a correction or a status trail cannot quietly vanish with its
-- tenant. That is the right rule and it is not being changed here — but it means
-- DELETE FROM businesses fails outright once any of them holds a row, and this
-- seed writes settlement events while an ordinary shift writes the other four.
-- Clearing them first is what keeps re-running this file the reset, including on
-- a database someone has actually worked a service through.
-- The UPDATE has to come before the DELETE because tabs.current_settlement_event_id
-- and tab_settlement_events.tab_id reference each other, both ON DELETE RESTRICT.
-- All of these are no-ops on a fresh database. Do not remove them as redundant.
UPDATE tabs SET current_settlement_event_id = NULL
WHERE business_id = '00000000-0000-0000-0000-000000000002';
DELETE FROM tab_settlement_events WHERE business_id = '00000000-0000-0000-0000-000000000002';
DELETE FROM queue_entry_events WHERE business_id = '00000000-0000-0000-0000-000000000002';
DELETE FROM order_line_status_timeline WHERE business_id = '00000000-0000-0000-0000-000000000002';
DELETE FROM order_revisions WHERE business_id = '00000000-0000-0000-0000-000000000002';
DELETE FROM menu_item_availability_events WHERE business_id = '00000000-0000-0000-0000-000000000002';

-- The floor graph cannot be left to the cascade. Its rows are joined by FKs that
-- are ON DELETE RESTRICT between two children of the same cascading parent — a
-- combination member pins its table, a seating pins its reservation, a table pins
-- its area and location — and PostgreSQL fires the parent's cascade triggers in an
-- order that does not guarantee the referencing side goes first. Relying on that
-- order fails on the second seed run with a foreign key violation on
-- table_combination_members. So the graph is torn down explicitly, children first.
DELETE FROM table_guest_sessions WHERE business_id = '00000000-0000-0000-0000-000000000002';
DELETE FROM tabs WHERE business_id = '00000000-0000-0000-0000-000000000002';
DELETE FROM table_seating_tables WHERE seating_id IN (
  SELECT id FROM table_seatings WHERE business_id = '00000000-0000-0000-0000-000000000002'
);
DELETE FROM table_seatings WHERE business_id = '00000000-0000-0000-0000-000000000002';
DELETE FROM reservation_table_assignments WHERE business_id = '00000000-0000-0000-0000-000000000002';
DELETE FROM queue_table_assignments WHERE business_id = '00000000-0000-0000-0000-000000000002';
DELETE FROM table_combination_members WHERE combination_id IN (
  SELECT id FROM table_combinations WHERE business_id = '00000000-0000-0000-0000-000000000002'
);
DELETE FROM table_combinations WHERE business_id = '00000000-0000-0000-0000-000000000002';
DELETE FROM reservation_waitlist_entries WHERE business_id = '00000000-0000-0000-0000-000000000002';
DELETE FROM tables WHERE business_id = '00000000-0000-0000-0000-000000000002';
DELETE FROM table_areas WHERE business_id = '00000000-0000-0000-0000-000000000002';

-- Three more tables hold a RESTRICT reference to locations. queue_service_days is
-- opened by the queue at run time rather than by this file, and the two purchasing
-- rows carry a nullable location the app may fill in, so a database that has had a
-- shift walked through it would otherwise refuse to be re-seeded.
DELETE FROM queue_service_days WHERE business_id = '00000000-0000-0000-0000-000000000002';
UPDATE purchase_orders SET location_id = NULL WHERE business_id = '00000000-0000-0000-0000-000000000002';
UPDATE inventory_count_sessions SET location_id = NULL WHERE business_id = '00000000-0000-0000-0000-000000000002';
DELETE FROM locations WHERE business_id = '00000000-0000-0000-0000-000000000002';

-- Deleting the business cascades to every remaining child table (staff, menus,
-- orders, inventory, queue, reservations, ml_predictions, daily_metrics, etc.)
DELETE FROM businesses WHERE id = '00000000-0000-0000-0000-000000000002';
-- Remove synthetic demo users (safe after cascade removed all FK references)
DELETE FROM users WHERE id IN (
  '00000000-0000-0000-0002-000000000010',
  '00000000-0000-0000-0002-000000000011',
  '00000000-0000-0000-0002-000000000012',
  '00000000-0000-0000-0002-000000000013',
  '00000000-0000-0000-0002-000000000014',
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
  is_accepting_orders, timezone, country_code, currency_code, locale, tax_label
) VALUES (
  '00000000-0000-0000-0000-000000000002',
  'Volt & Vine',
  'volt-and-vine',
  'venue@example.com',
  '+12025550100',
  'Musterstraße 1, 10115 Berlin, Germany',
  'A wholly synthetic venue used only for local demonstration data.',
  NULL,
  '',
  ARRAY['Bar', 'Cocktails', 'Craft Beer', 'Bar Food', 'Nightlife'],
  8, 90, 30, 14,
  '{"monday":{"open":"17:00","close":"02:00"},"tuesday":{"open":"17:00","close":"02:00"},"wednesday":{"open":"17:00","close":"02:00"},"thursday":{"open":"17:00","close":"02:00"},"friday":{"open":"17:00","close":"02:00"},"saturday":{"open":"17:00","close":"02:00"},"sunday":{"open":"17:00","close":"02:00"}}',
  '["reservations","queue","ordering","inventory","insights"]'::jsonb,
  TRUE,
  '["email","sms"]'::jsonb,
  TRUE,
  'Europe/Berlin', 'DE', 'EUR', 'de-DE', 'MwSt.'
);

-- Editable, non-fiscal German demo suggestions. They are operational defaults,
-- not legal advice or automatic item classification.
INSERT INTO tax_profiles (id, business_id, code, is_active) VALUES
('00000000-0000-0000-0037-000000000001', '00000000-0000-0000-0000-000000000002', 'STANDARD', TRUE),
('00000000-0000-0000-0037-000000000002', '00000000-0000-0000-0000-000000000002', 'REDUCED', TRUE),
('00000000-0000-0000-0037-000000000003', '00000000-0000-0000-0000-000000000002', 'EXEMPT', TRUE),
('00000000-0000-0000-0037-000000000004', '00000000-0000-0000-0000-000000000002', 'CUSTOM', TRUE);

INSERT INTO tax_profile_versions (
  id, tax_profile_id, business_id, name, rate, price_includes_tax, effective_from, note
) VALUES
('00000000-0000-0000-0037-000000000011', '00000000-0000-0000-0037-000000000001', '00000000-0000-0000-0000-000000000002', 'Beverages / standard', 19, TRUE, '2026-01-01T00:00:00+01:00', 'Editable demo suggestion; verify classification and rate.'),
('00000000-0000-0000-0037-000000000012', '00000000-0000-0000-0037-000000000002', '00000000-0000-0000-0000-000000000002', 'Food / reduced', 7, TRUE, '2026-01-01T00:00:00+01:00', 'Editable demo suggestion; verify classification and rate.'),
('00000000-0000-0000-0037-000000000013', '00000000-0000-0000-0037-000000000003', '00000000-0000-0000-0000-000000000002', 'Exempt / zero', 0, TRUE, '2026-01-01T00:00:00+01:00', 'Editable demo placeholder; confirm legal treatment.'),
('00000000-0000-0000-0037-000000000014', '00000000-0000-0000-0037-000000000004', '00000000-0000-0000-0000-000000000002', 'Custom', 0, TRUE, '2026-01-01T00:00:00+01:00', 'Editable venue-specific placeholder.');

ALTER TABLE menu_items ALTER COLUMN tax_profile_id
  SET DEFAULT '00000000-0000-0000-0037-000000000001';
ALTER TABLE item_library ALTER COLUMN tax_profile_id
  SET DEFAULT '00000000-0000-0000-0037-000000000001';

-- ─── Staff Users ──────────────────────────────────────────────────────────────
-- One demo account per role, so the stage-6 permission matrix is demonstrable
-- by logging in rather than by reading a table. Every account shares
-- __DEMO_PASSWORD_HASH__; see server/DATABASE.md for the seeding contract.
INSERT INTO users (id, email, name, phone, password_hash, user_type, created_at) VALUES
('00000000-0000-0000-0002-000000000010', 'owner@example.com',     'Demo Owner',              '+12025550101', '__DEMO_PASSWORD_HASH__', 'staff', NOW() - INTERVAL '45 days'),
('00000000-0000-0000-0002-000000000011', 'manager@example.com',   'Demo Manager',            '+12025550102', '__DEMO_PASSWORD_HASH__', 'staff', NOW() - INTERVAL '44 days'),
('00000000-0000-0000-0002-000000000012', 'host@example.com',      'Demo Host / Server',      '+12025550103', '__DEMO_PASSWORD_HASH__', 'staff', NOW() - INTERVAL '43 days'),
('00000000-0000-0000-0002-000000000013', 'bar@example.com',       'Demo Bartender',          '+12025550104', '__DEMO_PASSWORD_HASH__', 'staff', NOW() - INTERVAL '42 days'),
('00000000-0000-0000-0002-000000000014', 'inventory@example.com', 'Demo Inventory Operator', '+12025550105', '__DEMO_PASSWORD_HASH__', 'staff', NOW() - INTERVAL '41 days');

INSERT INTO staff (id, user_id, business_id, role, created_at) VALUES
('00000000-0000-0000-0003-000000000010', '00000000-0000-0000-0002-000000000010', '00000000-0000-0000-0000-000000000002', 'owner',              NOW() - INTERVAL '45 days'),
('00000000-0000-0000-0003-000000000011', '00000000-0000-0000-0002-000000000011', '00000000-0000-0000-0000-000000000002', 'manager',            NOW() - INTERVAL '44 days'),
('00000000-0000-0000-0003-000000000012', '00000000-0000-0000-0002-000000000012', '00000000-0000-0000-0000-000000000002', 'host_server',        NOW() - INTERVAL '43 days'),
('00000000-0000-0000-0003-000000000013', '00000000-0000-0000-0002-000000000013', '00000000-0000-0000-0000-000000000002', 'bar_kitchen',        NOW() - INTERVAL '42 days'),
('00000000-0000-0000-0003-000000000014', '00000000-0000-0000-0002-000000000014', '00000000-0000-0000-0000-000000000002', 'inventory_operator', NOW() - INTERVAL '41 days');

-- ─── Physical Layer: location, areas, tables, combinations, stations ──────────
-- Migrations 024 and 039 backfill a primary location, a default area and the
-- Kitchen/Bar stations for businesses that existed WHEN THEY RAN. This tenant is
-- created afterwards by this file, so it inherits none of them and must insert
-- its own. This section is placed before the menu, ordering and queue sections
-- on purpose: the station routing updates and the queue location/service-date
-- derivation further down already join these tables, and simply matched zero
-- rows until now.
--
-- IDs follow the newer convention used by the Stage 5 sections below: the third
-- group is the migration that introduced the table.

INSERT INTO locations (id, business_id, name, address, phone, is_primary, created_at, updated_at) VALUES
('00000000-0000-0005-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'Volt & Vine', 'Schönhauser Allee 42, 10435 Berlin, Germany', '+493012345678', TRUE, NOW() - INTERVAL '45 days', NOW() - INTERVAL '45 days');

-- ─── Table Areas ──────────────────────────────────────────────────────────────
INSERT INTO table_areas (id, business_id, location_id, name, sort_order, created_at, updated_at) VALUES
('00000000-0000-0024-0000-000000000101', '00000000-0000-0000-0000-000000000002', '00000000-0000-0005-0000-000000000001', 'Bar Counter', 10, NOW() - INTERVAL '45 days', NOW() - INTERVAL '45 days'),
('00000000-0000-0024-0000-000000000102', '00000000-0000-0000-0000-000000000002', '00000000-0000-0005-0000-000000000001', 'Main Room',   20, NOW() - INTERVAL '45 days', NOW() - INTERVAL '45 days'),
('00000000-0000-0024-0000-000000000103', '00000000-0000-0000-0000-000000000002', '00000000-0000-0005-0000-000000000001', 'Terrace',     30, NOW() - INTERVAL '45 days', NOW() - INTERVAL '45 days');

-- ─── Tables (20 across three areas, 64 covers) ────────────────────────────────
-- A spread of capacities so combination and capacity-override logic has real
-- cases to work on. Labels T1–T7 match the free-text orders.table_identifier
-- values already used by the historical orders below, which lets those orders be
-- attached to real tables rather than left half-populated.
--
-- Occupancy is NOT a column here. The floor board derives 'occupied' from an open
-- table_seatings row and 'reserved' from an active assignment; operational_state
-- carries only the three states staff set by hand. One table is left cleaning and
-- one out of service so those two board states are reachable from seeded data.
INSERT INTO tables (id, business_id, location_id, area_id, label, capacity, shape, sort_order, operational_state, operational_state_reason, operational_state_until, operational_state_changed_at, created_at, updated_at) VALUES
-- Bar Counter: six stools, pairs only
('00000000-0000-0024-0000-000000000201', '00000000-0000-0000-0000-000000000002', '00000000-0000-0005-0000-000000000001', '00000000-0000-0024-0000-000000000101', 'B1',  2, 'bar',       10, 'ready', NULL, NULL, NOW() - INTERVAL '45 days', NOW() - INTERVAL '45 days', NOW() - INTERVAL '45 days'),
('00000000-0000-0024-0000-000000000202', '00000000-0000-0000-0000-000000000002', '00000000-0000-0005-0000-000000000001', '00000000-0000-0024-0000-000000000101', 'B2',  2, 'bar',       20, 'ready', NULL, NULL, NOW() - INTERVAL '45 days', NOW() - INTERVAL '45 days', NOW() - INTERVAL '45 days'),
('00000000-0000-0024-0000-000000000203', '00000000-0000-0000-0000-000000000002', '00000000-0000-0005-0000-000000000001', '00000000-0000-0024-0000-000000000101', 'B3',  2, 'bar',       30, 'ready', NULL, NULL, NOW() - INTERVAL '45 days', NOW() - INTERVAL '45 days', NOW() - INTERVAL '45 days'),
('00000000-0000-0024-0000-000000000204', '00000000-0000-0000-0000-000000000002', '00000000-0000-0005-0000-000000000001', '00000000-0000-0024-0000-000000000101', 'B4',  2, 'bar',       40, 'ready', NULL, NULL, NOW() - INTERVAL '45 days', NOW() - INTERVAL '45 days', NOW() - INTERVAL '45 days'),
('00000000-0000-0024-0000-000000000205', '00000000-0000-0000-0000-000000000002', '00000000-0000-0005-0000-000000000001', '00000000-0000-0024-0000-000000000101', 'B5',  2, 'bar',       50, 'ready', NULL, NULL, NOW() - INTERVAL '45 days', NOW() - INTERVAL '45 days', NOW() - INTERVAL '45 days'),
('00000000-0000-0024-0000-000000000206', '00000000-0000-0000-0000-000000000002', '00000000-0000-0005-0000-000000000001', '00000000-0000-0024-0000-000000000101', 'B6',  2, 'bar',       60, 'ready', NULL, NULL, NOW() - INTERVAL '45 days', NOW() - INTERVAL '45 days', NOW() - INTERVAL '45 days'),
-- Main Room: the working floor — pairs, fours, and two large rectangles
('00000000-0000-0024-0000-000000000211', '00000000-0000-0000-0000-000000000002', '00000000-0000-0005-0000-000000000001', '00000000-0000-0024-0000-000000000102', 'T1',  2, 'square',    10, 'ready', NULL, NULL, NOW() - INTERVAL '45 days', NOW() - INTERVAL '45 days', NOW() - INTERVAL '45 days'),
('00000000-0000-0024-0000-000000000212', '00000000-0000-0000-0000-000000000002', '00000000-0000-0005-0000-000000000001', '00000000-0000-0024-0000-000000000102', 'T2',  2, 'square',    20, 'ready', NULL, NULL, NOW() - INTERVAL '45 days', NOW() - INTERVAL '45 days', NOW() - INTERVAL '45 days'),
('00000000-0000-0024-0000-000000000213', '00000000-0000-0000-0000-000000000002', '00000000-0000-0005-0000-000000000001', '00000000-0000-0024-0000-000000000102', 'T3',  2, 'square',    30, 'ready', NULL, NULL, NOW() - INTERVAL '45 days', NOW() - INTERVAL '45 days', NOW() - INTERVAL '45 days'),
('00000000-0000-0024-0000-000000000214', '00000000-0000-0000-0000-000000000002', '00000000-0000-0005-0000-000000000001', '00000000-0000-0024-0000-000000000102', 'T4',  2, 'square',    40, 'ready', NULL, NULL, NOW() - INTERVAL '45 days', NOW() - INTERVAL '45 days', NOW() - INTERVAL '45 days'),
('00000000-0000-0024-0000-000000000215', '00000000-0000-0000-0000-000000000002', '00000000-0000-0005-0000-000000000001', '00000000-0000-0024-0000-000000000102', 'T5',  4, 'round',     50, 'ready', NULL, NULL, NOW() - INTERVAL '45 days', NOW() - INTERVAL '45 days', NOW() - INTERVAL '45 days'),
('00000000-0000-0024-0000-000000000216', '00000000-0000-0000-0000-000000000002', '00000000-0000-0005-0000-000000000001', '00000000-0000-0024-0000-000000000102', 'T6',  4, 'round',     60, 'ready', NULL, NULL, NOW() - INTERVAL '45 days', NOW() - INTERVAL '45 days', NOW() - INTERVAL '45 days'),
('00000000-0000-0024-0000-000000000217', '00000000-0000-0000-0000-000000000002', '00000000-0000-0005-0000-000000000001', '00000000-0000-0024-0000-000000000102', 'T7',  4, 'round',     70, 'ready', NULL, NULL, NOW() - INTERVAL '45 days', NOW() - INTERVAL '45 days', NOW() - INTERVAL '45 days'),
('00000000-0000-0024-0000-000000000218', '00000000-0000-0000-0000-000000000002', '00000000-0000-0005-0000-000000000001', '00000000-0000-0024-0000-000000000102', 'T8',  4, 'round',     80, 'cleaning', 'Turning after the early sitting', NULL, NOW() - INTERVAL '20 minutes', NOW() - INTERVAL '45 days', NOW() - INTERVAL '45 days'),
('00000000-0000-0024-0000-000000000219', '00000000-0000-0000-0000-000000000002', '00000000-0000-0005-0000-000000000001', '00000000-0000-0024-0000-000000000102', 'T9',  6, 'rectangle', 90, 'ready', NULL, NULL, NOW() - INTERVAL '45 days', NOW() - INTERVAL '45 days', NOW() - INTERVAL '45 days'),
('00000000-0000-0024-0000-000000000220', '00000000-0000-0000-0000-000000000002', '00000000-0000-0005-0000-000000000001', '00000000-0000-0024-0000-000000000102', 'T10', 6, 'rectangle', 100, 'ready', NULL, NULL, NOW() - INTERVAL '45 days', NOW() - INTERVAL '45 days', NOW() - INTERVAL '45 days'),
-- Terrace: four fours, one closed for a wobbling leg
('00000000-0000-0024-0000-000000000231', '00000000-0000-0000-0000-000000000002', '00000000-0000-0005-0000-000000000001', '00000000-0000-0024-0000-000000000103', 'P1',  4, 'square',    10, 'ready', NULL, NULL, NOW() - INTERVAL '45 days', NOW() - INTERVAL '45 days', NOW() - INTERVAL '45 days'),
('00000000-0000-0024-0000-000000000232', '00000000-0000-0000-0000-000000000002', '00000000-0000-0005-0000-000000000001', '00000000-0000-0024-0000-000000000103', 'P2',  4, 'square',    20, 'ready', NULL, NULL, NOW() - INTERVAL '45 days', NOW() - INTERVAL '45 days', NOW() - INTERVAL '45 days'),
('00000000-0000-0024-0000-000000000233', '00000000-0000-0000-0000-000000000002', '00000000-0000-0005-0000-000000000001', '00000000-0000-0024-0000-000000000103', 'P3',  4, 'square',    30, 'ready', NULL, NULL, NOW() - INTERVAL '45 days', NOW() - INTERVAL '45 days', NOW() - INTERVAL '45 days'),
('00000000-0000-0024-0000-000000000234', '00000000-0000-0000-0000-000000000002', '00000000-0000-0005-0000-000000000001', '00000000-0000-0024-0000-000000000103', 'P4',  4, 'square',    40, 'out_of_service', 'Wobbling leg, repair booked', NOW() + INTERVAL '2 days', NOW() - INTERVAL '2 days', NOW() - INTERVAL '45 days', NOW() - INTERVAL '45 days');

-- ─── Table Combinations ───────────────────────────────────────────────────────
-- A multi-table allocation is only permitted when the exact set of tables matches
-- an active combination, and every member must sit in one area. Without at least
-- one of these the floor board's multi-table path is unreachable.
INSERT INTO table_combinations (id, business_id, location_id, area_id, name, capacity_override, is_active, created_at, updated_at) VALUES
('00000000-0000-0024-0000-000000000301', '00000000-0000-0000-0000-000000000002', '00000000-0000-0005-0000-000000000001', '00000000-0000-0024-0000-000000000102', 'Main Room T5 + T6', 8, TRUE, NOW() - INTERVAL '45 days', NOW() - INTERVAL '45 days'),
('00000000-0000-0024-0000-000000000302', '00000000-0000-0000-0000-000000000002', '00000000-0000-0005-0000-000000000001', '00000000-0000-0024-0000-000000000103', 'Terrace P1 + P2',   8, TRUE, NOW() - INTERVAL '45 days', NOW() - INTERVAL '45 days');

INSERT INTO table_combination_members (combination_id, table_id) VALUES
('00000000-0000-0024-0000-000000000301', '00000000-0000-0024-0000-000000000215'),
('00000000-0000-0024-0000-000000000301', '00000000-0000-0024-0000-000000000216'),
('00000000-0000-0024-0000-000000000302', '00000000-0000-0024-0000-000000000231'),
('00000000-0000-0024-0000-000000000302', '00000000-0000-0024-0000-000000000232');

-- ─── Preparation Stations ─────────────────────────────────────────────────────
-- Named exactly as migration 039 names them, because the menu_items, item_library
-- and order_line_items routing updates further down match on ps.name.
INSERT INTO preparation_stations (id, business_id, name, sort_order, is_active, created_at, updated_at) VALUES
('00000000-0000-0039-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'Bar',     10, TRUE, NOW() - INTERVAL '45 days', NOW() - INTERVAL '45 days'),
('00000000-0000-0039-0000-000000000002', '00000000-0000-0000-0000-000000000002', 'Kitchen', 20, TRUE, NOW() - INTERVAL '45 days', NOW() - INTERVAL '45 days');

-- ─── Customers ────────────────────────────────────────────────────────────────
-- Business-scoped customer identities (Phase 5.9: reservations.customer_id → customers).
-- Diverse RFM profiles: champions / loyal / promising / at-risk / lost / new
INSERT INTO customers (id, business_id, name, phone, email, created_at) VALUES
-- Champions (high recency, high frequency, regular in last 2 weeks)
('00000000-0000-0000-0001-000000000010', '00000000-0000-0000-0000-000000000002', 'Alex Morgan',   '+12025550110', 'alex.morgan@example.com',   NOW() - INTERVAL '42 days'),
('00000000-0000-0000-0001-000000000011', '00000000-0000-0000-0000-000000000002', 'Maria Santos',  '+12025550111', 'maria.santos@example.com',  NOW() - INTERVAL '38 days'),
('00000000-0000-0000-0001-000000000012', '00000000-0000-0000-0000-000000000002', 'Chris Patel',   '+12025550112', 'chris.patel@example.com',   NOW() - INTERVAL '35 days'),
-- Loyal (3-4 visits, last visit within 10 days)
('00000000-0000-0000-0001-000000000013', '00000000-0000-0000-0000-000000000002', 'Pat Kim',       '+12025550113', 'pat.kim@example.com',       NOW() - INTERVAL '30 days'),
('00000000-0000-0000-0001-000000000014', '00000000-0000-0000-0000-000000000002', 'Sam Lee',       '+12025550114', 'sam.lee@example.com',       NOW() - INTERVAL '25 days'),
-- Promising (1-2 visits, very recent)
('00000000-0000-0000-0001-000000000015', '00000000-0000-0000-0000-000000000002', 'Jordan Rivera', '+12025550115', 'jordan.rivera@example.com', NOW() - INTERVAL '12 days'),
('00000000-0000-0000-0001-000000000016', '00000000-0000-0000-0000-000000000002', 'Casey Chen',    '+12025550116', 'casey.chen@example.com',    NOW() - INTERVAL '9 days'),
-- At Risk (multiple visits, none in last 17+ days)
('00000000-0000-0000-0001-000000000017', '00000000-0000-0000-0000-000000000002', 'Taylor Brooks', '+12025550117', 'taylor.brooks@example.com', NOW() - INTERVAL '40 days'),
('00000000-0000-0000-0001-000000000018', '00000000-0000-0000-0000-000000000002', 'Morgan Davis',  '+12025550118', 'morgan.davis@example.com',  NOW() - INTERVAL '38 days'),
-- Needs Attention (was frequent, dormant 4+ weeks)
('00000000-0000-0000-0001-000000000019', '00000000-0000-0000-0000-000000000002', 'Riley Wilson',  '+12025550119', 'riley.wilson@example.com',  NOW() - INTERVAL '44 days'),
-- Lost (single visit 6 weeks ago, never returned)
('00000000-0000-0000-0001-000000000020', '00000000-0000-0000-0000-000000000002', 'Quinn Foster',  '+12025550120', 'quinn.foster@example.com',  NOW() - INTERVAL '44 days'),
-- New (first reservation is tomorrow)
('00000000-0000-0000-0001-000000000021', '00000000-0000-0000-0000-000000000002', 'Drew Nakamura', '+12025550121', 'drew.nakamura@example.com', NOW() - INTERVAL '1 day');

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

-- ─── Default Booking Schedule ────────────────────────────────────────────────
-- Booking time is intentionally separate from the public operating_hours JSON.
-- This default starts from the same seven overnight windows for demo parity.
INSERT INTO booking_schedules (
  id, business_id, minimum_notice_minutes, advance_booking_days,
  slot_interval_minutes, default_duration_minutes, created_at
) VALUES (
  '00000000-0000-0000-0006-000000000001',
  '00000000-0000-0000-0000-000000000002',
  0, 14, 30, 90, NOW() - INTERVAL '45 days'
);

INSERT INTO booking_schedule_windows (
  schedule_id, weekday, start_time, end_time, ends_next_day, created_at
) VALUES
('00000000-0000-0000-0006-000000000001', 0, '17:00', '02:00', TRUE, NOW() - INTERVAL '45 days'),
('00000000-0000-0000-0006-000000000001', 1, '17:00', '02:00', TRUE, NOW() - INTERVAL '45 days'),
('00000000-0000-0000-0006-000000000001', 2, '17:00', '02:00', TRUE, NOW() - INTERVAL '45 days'),
('00000000-0000-0000-0006-000000000001', 3, '17:00', '02:00', TRUE, NOW() - INTERVAL '45 days'),
('00000000-0000-0000-0006-000000000001', 4, '17:00', '02:00', TRUE, NOW() - INTERVAL '45 days'),
('00000000-0000-0000-0006-000000000001', 5, '17:00', '02:00', TRUE, NOW() - INTERVAL '45 days'),
('00000000-0000-0000-0006-000000000001', 6, '17:00', '02:00', TRUE, NOW() - INTERVAL '45 days');

-- ─── Cleanup: remove any out-of-hours reservations left by prior seeds ─────────
DELETE FROM reservations
WHERE business_id = '00000000-0000-0000-0000-000000000002'
  AND EXTRACT(HOUR FROM time AT TIME ZONE 'Europe/Berlin') BETWEEN 3 AND 16;

-- ─── Reservations ─────────────────────────────────────────────────────────────
-- 38 total (34 original + 4 new upcoming): mostly completed, some confirmed, 2 cancelled
-- Times use (... AT TIME ZONE 'Europe/Berlin') so hours are in Berlin local time
-- regardless of the PostgreSQL server timezone. Bar hours: 17:00–02:00 Berlin.
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
  (DATE_TRUNC('day', NOW() AT TIME ZONE 'Europe/Berlin') - INTERVAL '35 days' + INTERVAL '20 hours') AT TIME ZONE 'Europe/Berlin',
  '+12025550110', 'alex.morgan@example.com', NULL, 'completed', 2, NOW() - INTERVAL '36 days'),
('00000000-0000-0000-0005-000000000002', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000010', '00000000-0000-0000-0004-000000000011',
  (DATE_TRUNC('day', NOW() AT TIME ZONE 'Europe/Berlin') - INTERVAL '21 days' + INTERVAL '19 hours') AT TIME ZONE 'Europe/Berlin',
  '+12025550110', 'alex.morgan@example.com', 'Birthday drinks for 4', 'completed', 4, NOW() - INTERVAL '22 days'),
('00000000-0000-0000-0005-000000000003', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000010', '00000000-0000-0000-0004-000000000010',
  (DATE_TRUNC('day', NOW() AT TIME ZONE 'Europe/Berlin') - INTERVAL '7 days' + INTERVAL '21 hours') AT TIME ZONE 'Europe/Berlin',
  '+12025550110', 'alex.morgan@example.com', NULL, 'completed', 2, NOW() - INTERVAL '8 days'),
('00000000-0000-0000-0005-000000000004', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000010', '00000000-0000-0000-0004-000000000010',
  (DATE_TRUNC('day', NOW() AT TIME ZONE 'Europe/Berlin') + INTERVAL '3 days' + INTERVAL '20 hours') AT TIME ZONE 'Europe/Berlin',
  '+12025550110', 'alex.morgan@example.com', NULL, 'confirmed', 2, NOW() - INTERVAL '1 day'),

-- Maria Santos — Champion (4 completed visits)
('00000000-0000-0000-0005-000000000005', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000011', '00000000-0000-0000-0004-000000000011',
  (DATE_TRUNC('day', NOW() AT TIME ZONE 'Europe/Berlin') - INTERVAL '28 days' + INTERVAL '19 hours 30 minutes') AT TIME ZONE 'Europe/Berlin',
  '+12025550111', 'maria.santos@example.com', 'Table for 3', 'completed', 3, NOW() - INTERVAL '29 days'),
('00000000-0000-0000-0005-000000000006', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000011', '00000000-0000-0000-0004-000000000010',
  (DATE_TRUNC('day', NOW() AT TIME ZONE 'Europe/Berlin') - INTERVAL '14 days' + INTERVAL '20 hours') AT TIME ZONE 'Europe/Berlin',
  '+12025550111', 'maria.santos@example.com', NULL, 'completed', 2, NOW() - INTERVAL '15 days'),
('00000000-0000-0000-0005-000000000007', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000011', '00000000-0000-0000-0004-000000000011',
  (DATE_TRUNC('day', NOW() AT TIME ZONE 'Europe/Berlin') - INTERVAL '5 days' + INTERVAL '21 hours') AT TIME ZONE 'Europe/Berlin',
  '+12025550111', 'maria.santos@example.com', 'Special occasion', 'completed', 4, NOW() - INTERVAL '6 days'),
('00000000-0000-0000-0005-000000000008', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000011', '00000000-0000-0000-0004-000000000010',
  (DATE_TRUNC('day', NOW() AT TIME ZONE 'Europe/Berlin') - INTERVAL '1 day' + INTERVAL '22 hours') AT TIME ZONE 'Europe/Berlin',
  '+12025550111', 'maria.santos@example.com', NULL, 'completed', 2, NOW() - INTERVAL '2 days'),

-- Chris Patel — Champion (3 completed, 1 upcoming confirmed HIGH RISK)
('00000000-0000-0000-0005-000000000009', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000012', '00000000-0000-0000-0004-000000000010',
  (DATE_TRUNC('day', NOW() AT TIME ZONE 'Europe/Berlin') - INTERVAL '24 days' + INTERVAL '20 hours 30 minutes') AT TIME ZONE 'Europe/Berlin',
  '+12025550112', 'chris.patel@example.com', NULL, 'completed', 2, NOW() - INTERVAL '25 days'),
('00000000-0000-0000-0005-000000000010', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000012', '00000000-0000-0000-0004-000000000011',
  (DATE_TRUNC('day', NOW() AT TIME ZONE 'Europe/Berlin') - INTERVAL '14 days' + INTERVAL '19 hours') AT TIME ZONE 'Europe/Berlin',
  '+12025550112', 'chris.patel@example.com', 'Work team drinks', 'completed', 6, NOW() - INTERVAL '15 days'),
('00000000-0000-0000-0005-000000000011', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000012', '00000000-0000-0000-0004-000000000010',
  (DATE_TRUNC('day', NOW() AT TIME ZONE 'Europe/Berlin') - INTERVAL '7 days' + INTERVAL '20 hours') AT TIME ZONE 'Europe/Berlin',
  '+12025550112', 'chris.patel@example.com', NULL, 'completed', 2, NOW() - INTERVAL '8 days'),
('00000000-0000-0000-0005-000000000012', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000012', '00000000-0000-0000-0004-000000000011',
  (DATE_TRUNC('day', NOW() AT TIME ZONE 'Europe/Berlin') + INTERVAL '5 days' + INTERVAL '19 hours 30 minutes') AT TIME ZONE 'Europe/Berlin',
  '+12025550112', 'chris.patel@example.com', 'Table for 5', 'confirmed', 5, NOW() - INTERVAL '1 day'),

-- Pat Kim — Loyal (2 completed, 1 upcoming confirmed)
('00000000-0000-0000-0005-000000000013', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000013', '00000000-0000-0000-0004-000000000011',
  (DATE_TRUNC('day', NOW() AT TIME ZONE 'Europe/Berlin') - INTERVAL '21 days' + INTERVAL '19 hours') AT TIME ZONE 'Europe/Berlin',
  '+12025550113', 'pat.kim@example.com', NULL, 'completed', 3, NOW() - INTERVAL '22 days'),
('00000000-0000-0000-0005-000000000014', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000013', '00000000-0000-0000-0004-000000000010',
  (DATE_TRUNC('day', NOW() AT TIME ZONE 'Europe/Berlin') - INTERVAL '10 days' + INTERVAL '21 hours') AT TIME ZONE 'Europe/Berlin',
  '+12025550113', 'pat.kim@example.com', NULL, 'completed', 2, NOW() - INTERVAL '11 days'),
('00000000-0000-0000-0005-000000000015', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000013', '00000000-0000-0000-0004-000000000011',
  (DATE_TRUNC('day', NOW() AT TIME ZONE 'Europe/Berlin') + INTERVAL '3 days' + INTERVAL '20 hours') AT TIME ZONE 'Europe/Berlin',
  '+12025550113', 'pat.kim@example.com', NULL, 'confirmed', 4, NOW() - INTERVAL '1 day'),

-- Sam Lee — Loyal (2 completed, 1 upcoming confirmed HIGH RISK)
('00000000-0000-0000-0005-000000000016', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000014', '00000000-0000-0000-0004-000000000010',
  (DATE_TRUNC('day', NOW() AT TIME ZONE 'Europe/Berlin') - INTERVAL '18 days' + INTERVAL '20 hours') AT TIME ZONE 'Europe/Berlin',
  '+12025550114', 'sam.lee@example.com', NULL, 'completed', 2, NOW() - INTERVAL '19 days'),
('00000000-0000-0000-0005-000000000017', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000014', '00000000-0000-0000-0004-000000000011',
  (DATE_TRUNC('day', NOW() AT TIME ZONE 'Europe/Berlin') - INTERVAL '7 days' + INTERVAL '19 hours 30 minutes') AT TIME ZONE 'Europe/Berlin',
  '+12025550114', 'sam.lee@example.com', NULL, 'completed', 3, NOW() - INTERVAL '8 days'),
('00000000-0000-0000-0005-000000000018', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000014', '00000000-0000-0000-0004-000000000010',
  (DATE_TRUNC('day', NOW() AT TIME ZONE 'Europe/Berlin') + INTERVAL '7 days' + INTERVAL '21 hours') AT TIME ZONE 'Europe/Berlin',
  '+12025550114', 'sam.lee@example.com', NULL, 'confirmed', 2, NOW()),

-- Jordan Rivera — Promising (2 completed, 1 upcoming confirmed)
('00000000-0000-0000-0005-000000000019', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000015', '00000000-0000-0000-0004-000000000010',
  (DATE_TRUNC('day', NOW() AT TIME ZONE 'Europe/Berlin') - INTERVAL '10 days' + INTERVAL '21 hours') AT TIME ZONE 'Europe/Berlin',
  '+12025550115', 'jordan.rivera@example.com', NULL, 'completed', 2, NOW() - INTERVAL '11 days'),
('00000000-0000-0000-0005-000000000020', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000015', '00000000-0000-0000-0004-000000000011',
  (DATE_TRUNC('day', NOW() AT TIME ZONE 'Europe/Berlin') - INTERVAL '2 days' + INTERVAL '20 hours') AT TIME ZONE 'Europe/Berlin',
  '+12025550115', 'jordan.rivera@example.com', NULL, 'completed', 3, NOW() - INTERVAL '3 days'),
('00000000-0000-0000-0005-000000000035', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000015', '00000000-0000-0000-0004-000000000010',
  (DATE_TRUNC('day', NOW() AT TIME ZONE 'Europe/Berlin') + INTERVAL '2 days' + INTERVAL '19 hours') AT TIME ZONE 'Europe/Berlin',
  '+12025550115', 'jordan.rivera@example.com', NULL, 'confirmed', 2, NOW()),

-- Casey Chen — Promising (1 completed, 1 upcoming confirmed)
('00000000-0000-0000-0005-000000000021', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000016', '00000000-0000-0000-0004-000000000010',
  (DATE_TRUNC('day', NOW() AT TIME ZONE 'Europe/Berlin') - INTERVAL '8 days' + INTERVAL '22 hours') AT TIME ZONE 'Europe/Berlin',
  '+12025550116', 'casey.chen@example.com', NULL, 'completed', 2, NOW() - INTERVAL '9 days'),
('00000000-0000-0000-0005-000000000022', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000016', '00000000-0000-0000-0004-000000000011',
  (DATE_TRUNC('day', NOW() AT TIME ZONE 'Europe/Berlin') + INTERVAL '2 days' + INTERVAL '20 hours') AT TIME ZONE 'Europe/Berlin',
  '+12025550116', 'casey.chen@example.com', 'Table for 4', 'confirmed', 4, NOW()),

-- Taylor Brooks — At Risk (3 completed, 1 cancelled, 1 upcoming confirmed)
('00000000-0000-0000-0005-000000000023', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000017', '00000000-0000-0000-0004-000000000011',
  (DATE_TRUNC('day', NOW() AT TIME ZONE 'Europe/Berlin') - INTERVAL '36 days' + INTERVAL '20 hours') AT TIME ZONE 'Europe/Berlin',
  '+12025550117', 'taylor.brooks@example.com', NULL, 'cancelled', 3, NOW() - INTERVAL '37 days'),
('00000000-0000-0000-0005-000000000024', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000017', '00000000-0000-0000-0004-000000000010',
  (DATE_TRUNC('day', NOW() AT TIME ZONE 'Europe/Berlin') - INTERVAL '28 days' + INTERVAL '21 hours') AT TIME ZONE 'Europe/Berlin',
  '+12025550117', 'taylor.brooks@example.com', NULL, 'completed', 2, NOW() - INTERVAL '29 days'),
('00000000-0000-0000-0005-000000000025', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000017', '00000000-0000-0000-0004-000000000011',
  (DATE_TRUNC('day', NOW() AT TIME ZONE 'Europe/Berlin') - INTERVAL '22 days' + INTERVAL '20 hours') AT TIME ZONE 'Europe/Berlin',
  '+12025550117', 'taylor.brooks@example.com', NULL, 'completed', 4, NOW() - INTERVAL '23 days'),
('00000000-0000-0000-0005-000000000026', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000017', '00000000-0000-0000-0004-000000000010',
  (DATE_TRUNC('day', NOW() AT TIME ZONE 'Europe/Berlin') - INTERVAL '17 days' + INTERVAL '21 hours 30 minutes') AT TIME ZONE 'Europe/Berlin',
  '+12025550117', 'taylor.brooks@example.com', NULL, 'completed', 2, NOW() - INTERVAL '18 days'),
('00000000-0000-0000-0005-000000000036', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000017', '00000000-0000-0000-0004-000000000010',
  (DATE_TRUNC('day', NOW() AT TIME ZONE 'Europe/Berlin') + INTERVAL '3 days' + INTERVAL '21 hours 30 minutes') AT TIME ZONE 'Europe/Berlin',
  '+12025550117', 'taylor.brooks@example.com', NULL, 'confirmed', 2, NOW()),

-- Morgan Davis — At Risk (2 completed, 1 cancelled, 1 upcoming confirmed)
('00000000-0000-0000-0005-000000000027', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000018', '00000000-0000-0000-0004-000000000010',
  (DATE_TRUNC('day', NOW() AT TIME ZONE 'Europe/Berlin') - INTERVAL '28 days' + INTERVAL '22 hours') AT TIME ZONE 'Europe/Berlin',
  '+12025550118', 'morgan.davis@example.com', NULL, 'cancelled', 2, NOW() - INTERVAL '29 days'),
('00000000-0000-0000-0005-000000000028', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000018', '00000000-0000-0000-0004-000000000011',
  (DATE_TRUNC('day', NOW() AT TIME ZONE 'Europe/Berlin') - INTERVAL '22 days' + INTERVAL '20 hours') AT TIME ZONE 'Europe/Berlin',
  '+12025550118', 'morgan.davis@example.com', NULL, 'completed', 3, NOW() - INTERVAL '23 days'),
('00000000-0000-0000-0005-000000000029', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000018', '00000000-0000-0000-0004-000000000010',
  (DATE_TRUNC('day', NOW() AT TIME ZONE 'Europe/Berlin') - INTERVAL '17 days' + INTERVAL '21 hours') AT TIME ZONE 'Europe/Berlin',
  '+12025550118', 'morgan.davis@example.com', NULL, 'completed', 2, NOW() - INTERVAL '18 days'),
('00000000-0000-0000-0005-000000000037', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000018', '00000000-0000-0000-0004-000000000011',
  (DATE_TRUNC('day', NOW() AT TIME ZONE 'Europe/Berlin') + INTERVAL '7 days' + INTERVAL '20 hours') AT TIME ZONE 'Europe/Berlin',
  '+12025550118', 'morgan.davis@example.com', NULL, 'confirmed', 3, NOW()),

-- Riley Wilson — Needs Attention (3 completed, 1 upcoming confirmed)
('00000000-0000-0000-0005-000000000030', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000019', '00000000-0000-0000-0004-000000000011',
  (DATE_TRUNC('day', NOW() AT TIME ZONE 'Europe/Berlin') - INTERVAL '42 days' + INTERVAL '19 hours') AT TIME ZONE 'Europe/Berlin',
  '+12025550119', 'riley.wilson@example.com', NULL, 'completed', 4, NOW() - INTERVAL '43 days'),
('00000000-0000-0000-0005-000000000031', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000019', '00000000-0000-0000-0004-000000000010',
  (DATE_TRUNC('day', NOW() AT TIME ZONE 'Europe/Berlin') - INTERVAL '35 days' + INTERVAL '21 hours') AT TIME ZONE 'Europe/Berlin',
  '+12025550119', 'riley.wilson@example.com', NULL, 'completed', 2, NOW() - INTERVAL '36 days'),
('00000000-0000-0000-0005-000000000032', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000019', '00000000-0000-0000-0004-000000000011',
  (DATE_TRUNC('day', NOW() AT TIME ZONE 'Europe/Berlin') - INTERVAL '28 days' + INTERVAL '20 hours') AT TIME ZONE 'Europe/Berlin',
  '+12025550119', 'riley.wilson@example.com', NULL, 'completed', 3, NOW() - INTERVAL '29 days'),
('00000000-0000-0000-0005-000000000038', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000019', '00000000-0000-0000-0004-000000000011',
  (DATE_TRUNC('day', NOW() AT TIME ZONE 'Europe/Berlin') + INTERVAL '7 days' + INTERVAL '19 hours') AT TIME ZONE 'Europe/Berlin',
  '+12025550119', 'riley.wilson@example.com', 'Birthday celebration', 'confirmed', 3, NOW()),

-- Quinn Foster — Lost (single visit 41 days ago)
('00000000-0000-0000-0005-000000000033', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000020', '00000000-0000-0000-0004-000000000010',
  (DATE_TRUNC('day', NOW() AT TIME ZONE 'Europe/Berlin') - INTERVAL '41 days' + INTERVAL '21 hours') AT TIME ZONE 'Europe/Berlin',
  '+12025550120', 'quinn.foster@example.com', NULL, 'completed', 2, NOW() - INTERVAL '42 days'),

-- Drew Nakamura — New (first reservation: tomorrow evening)
('00000000-0000-0000-0005-000000000034', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000021', '00000000-0000-0000-0004-000000000010',
  (DATE_TRUNC('day', NOW() AT TIME ZONE 'Europe/Berlin') + INTERVAL '1 day' + INTERVAL '20 hours') AT TIME ZONE 'Europe/Berlin',
  '+12025550121', 'drew.nakamura@example.com', NULL, 'confirmed', 2, NOW() - INTERVAL '1 hour'),

-- Tonight's service. These two are the reservations the seated parties below hang
-- off, so unlike every row above them they are anchored to NOW() rather than to a
-- Berlin wall-clock hour: a seating that opened forty minutes ago has to stay forty
-- minutes old whenever this file is run, or the demo contradicts itself.
-- Maria Santos ate early, settled at the register and left; Sam Lee is still here.
('00000000-0000-0000-0005-000000000039', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000011', '00000000-0000-0000-0004-000000000011',
  NOW() - INTERVAL '3 hours',
  '+12025550111', 'maria.santos@example.com', 'Table by the window if free', 'completed', 4, NOW() - INTERVAL '2 days'),
('00000000-0000-0000-0005-000000000040', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000014', '00000000-0000-0000-0004-000000000010',
  NOW() - INTERVAL '40 minutes',
  '+12025550114', 'sam.lee@example.com', NULL, 'confirmed', 2, NOW() - INTERVAL '1 day');

-- ─── Menus ─────────────────────────────────────────────────────────────────────
-- Two menus, and they exercise both halves of activation: Classic Menu is
-- always on, Happy Hour is served only inside its window below. The schedule
-- used to live as prose in the description ("Every day 5-8 PM") where nothing
-- could read it; it is data now.
INSERT INTO menus (id, business_id, name, description, is_active) VALUES
('00000000-0000-0000-0006-000000000001', '00000000-0000-0000-0000-000000000002', 'Happy Hour',   'Reduced prices, good vibes.',               TRUE),
('00000000-0000-0000-0006-000000000002', '00000000-0000-0000-0000-000000000002', 'Classic Menu', 'Our full offering, available all evening.', TRUE);

-- ─── Menu activation windows ──────────────────────────────────────────────────
-- Happy Hour runs every day 17:00-20:00 in the venue's own timezone
-- (Europe/Berlin), never UTC. days_of_week is 0=Monday..6=Sunday. Classic Menu
-- deliberately gets no row: a menu with no windows is always on.
INSERT INTO menu_activation_windows
    (id, menu_id, business_id, days_of_week, start_time, end_time, is_active) VALUES
('00000000-0000-0000-0016-000000000001', '00000000-0000-0000-0006-000000000001',
 '00000000-0000-0000-0000-000000000002', ARRAY[0,1,2,3,4,5,6], '17:00', '20:00', TRUE);

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

-- Demo-only explicit classification: kitchen food uses the editable reduced
-- profile; beverages retain the standard profile. Runtime code never infers it.
UPDATE menu_items
SET tax_profile_id = '00000000-0000-0000-0037-000000000002'
WHERE routing_tag = 'kitchen';

UPDATE menu_items mi
SET preparation_station_id = ps.id,
    routes_to_all_stations = FALSE
FROM preparation_stations ps
WHERE ps.business_id = mi.business_id
  AND ps.name = CASE mi.routing_tag WHEN 'bar' THEN 'Bar' ELSE 'Kitchen' END
  AND mi.routing_tag <> 'any';

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

UPDATE item_library
SET tax_profile_id = '00000000-0000-0000-0037-000000000002'
WHERE routing_tag = 'kitchen';

UPDATE item_library il
SET preparation_station_id = ps.id,
    routes_to_all_stations = FALSE
FROM preparation_stations ps
WHERE ps.business_id = il.business_id
  AND ps.name = CASE il.routing_tag WHEN 'bar' THEN 'Bar' ELSE 'Kitchen' END
  AND il.routing_tag <> 'any';

ALTER TABLE menu_items ALTER COLUMN tax_profile_id DROP DEFAULT;
ALTER TABLE item_library ALTER COLUMN tax_profile_id DROP DEFAULT;

-- ─── Inventory Items ──────────────────────────────────────────────────────────
-- current_quantity is the exact sum of stock_movements.quantity_delta below.
-- IPA Keg is intentionally below par to demonstrate the low-stock alert.
INSERT INTO inventory_items (id, business_id, name, unit, current_quantity, par_quantity, cost_per_unit, weighted_average_cost, cost_currency_code) VALUES
('00000000-0000-0000-0010-000000000001', '00000000-0000-0000-0000-000000000002', 'Whisky Blended',   'bottles',  18,   8,  38.00, 38.00, 'EUR'),  -- receive 24 − waste 6
('00000000-0000-0000-0010-000000000002', '00000000-0000-0000-0000-000000000002', 'Vodka Premium',    'bottles',  14,   6,  32.00, 32.00, 'EUR'),  -- receive 18 − waste 4
('00000000-0000-0000-0010-000000000003', '00000000-0000-0000-0000-000000000002', 'Rum Dark',         'bottles',   9,   4,  28.00, 28.00, 'EUR'),  -- receive 12 − waste 3
('00000000-0000-0000-0010-000000000004', '00000000-0000-0000-0000-000000000002', 'Gin London Dry',   'bottles',  10,   5,  35.00, 35.00, 'EUR'),  -- receive 15 − waste 5
('00000000-0000-0000-0010-000000000005', '00000000-0000-0000-0000-000000000002', 'Tequila Silver',   'bottles',   6,   3,  30.00, 30.00, 'EUR'),  -- receive 8 − waste 2
('00000000-0000-0000-0010-000000000006', '00000000-0000-0000-0000-000000000002', 'Red Wine',         'bottles',  16,   8,  18.00, 18.00, 'EUR'),  -- receive 24 − waste 8
('00000000-0000-0000-0010-000000000007', '00000000-0000-0000-0000-000000000002', 'White Wine',       'bottles',  14,   6,  16.00, 16.00, 'EUR'),  -- receive 20 − waste 6
('00000000-0000-0000-0010-000000000008', '00000000-0000-0000-0000-000000000002', 'Prosecco',         'bottles',   9,   4,  14.00, 14.00, 'EUR'),  -- receive 12 − waste 3
('00000000-0000-0000-0010-000000000009', '00000000-0000-0000-0000-000000000002', 'Lager Keg',        'kegs',      3,   2, 185.00, 185.00, 'EUR'),  -- receive 3
('00000000-0000-0000-0010-000000000010', '00000000-0000-0000-0000-000000000002', 'IPA Keg',          'kegs',      1,   2, 195.00, 195.00, 'EUR'),  -- receive 2 − waste 1 → BELOW PAR
('00000000-0000-0000-0010-000000000011', '00000000-0000-0000-0000-000000000002', 'Chicken Wings',    'kg',      3.5,   3,   9.50, 9.50, 'EUR'),  -- receive 5 − waste 1.5
('00000000-0000-0000-0010-000000000012', '00000000-0000-0000-0000-000000000002', 'Nachos Kit',       'kg',      3.5,   3,   6.00, 6.00, 'EUR');  -- receive 4 − waste 0.5

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
-- The required Stage 2 snapshot columns are filled from the explicit menu tax
-- assignments below; temporary defaults only keep this compact fixture readable.
ALTER TABLE orders ALTER COLUMN currency_code SET DEFAULT 'EUR';
ALTER TABLE orders ALTER COLUMN subtotal_amount SET DEFAULT 0;
ALTER TABLE orders ALTER COLUMN tax_amount SET DEFAULT 0;
ALTER TABLE order_line_items ALTER COLUMN currency_code SET DEFAULT 'EUR';
ALTER TABLE order_line_items ALTER COLUMN tax_profile_name SET DEFAULT 'Pending seed snapshot';
ALTER TABLE order_line_items ALTER COLUMN tax_profile_code SET DEFAULT 'PENDING';
ALTER TABLE order_line_items ALTER COLUMN tax_rate SET DEFAULT 0;
ALTER TABLE order_line_items ALTER COLUMN price_includes_tax SET DEFAULT TRUE;
ALTER TABLE order_line_items ALTER COLUMN subtotal_amount SET DEFAULT 0;
ALTER TABLE order_line_items ALTER COLUMN tax_amount SET DEFAULT 0;
ALTER TABLE order_line_items ALTER COLUMN total_amount SET DEFAULT 0;

INSERT INTO orders (
  id, business_id, session_token_hash, table_identifier, status, idempotency_key,
  request_fingerprint, total_amount, placed_at
)
SELECT
  id::uuid,
  business_id::uuid,
  encode(digest(session_token, 'sha256'), 'hex'),
  table_identifier,
  status,
  idempotency_key,
  encode(digest(business_id || ':' || idempotency_key, 'sha256'), 'hex'),
  total_amount,
  placed_at
FROM (VALUES
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
('00000000-0000-0000-0011-000000000020', '00000000-0000-0000-0000-000000000002', 'pzl-s-sun-005', 'T5', 'served', 'puzzles-order-sun-005', 38.00, DATE_TRUNC('day', NOW()) - INTERVAL '5 days' + INTERVAL '22 hours'),
-- Tonight, on the two live tabs below. NOW()-relative for the same reason the two
-- tonight reservations are. 21 and 22 are the open tab on T3: a round the guest
-- placed from the table QR and a second the bartender added, which is what makes
-- "both rounds share one tab" checkable on seeded data. 23 and 24 are the tab on
-- T5+T6 that was settled at the venue register before the party left.
('00000000-0000-0000-0011-000000000021', '00000000-0000-0000-0000-000000000002', 'voltvine-s-tonight-001', 'T3', 'served',    'voltvine-order-tonight-001', 27.00, NOW() - INTERVAL '30 minutes'),
('00000000-0000-0000-0011-000000000022', '00000000-0000-0000-0000-000000000002', 'voltvine-s-tonight-002', 'T3', 'preparing', 'voltvine-order-tonight-002', 39.00, NOW() - INTERVAL '8 minutes'),
('00000000-0000-0000-0011-000000000023', '00000000-0000-0000-0000-000000000002', 'voltvine-s-tonight-003', 'T5', 'served',    'voltvine-order-tonight-003', 78.00, NOW() - INTERVAL '2 hours 30 minutes'),
('00000000-0000-0000-0011-000000000024', '00000000-0000-0000-0000-000000000002', 'voltvine-s-tonight-004', 'T5', 'served',    'voltvine-order-tonight-004', 38.00, NOW() - INTERVAL '1 hour 50 minutes')
) AS seeded_orders(
  id, business_id, session_token, table_identifier, status, idempotency_key,
  total_amount, placed_at
);

-- ─── Order Line Items ─────────────────────────────────────────────────────────
ALTER TABLE order_line_items ALTER COLUMN business_id
  SET DEFAULT '00000000-0000-0000-0000-000000000002';
INSERT INTO order_line_items (id, order_id, item_id, item_name, quantity, unit_price, routing_tag) VALUES
-- Order 1: Espresso Martini x2 + Nachos x1 = €37
(gen_random_uuid(), '00000000-0000-0000-0011-000000000001', '00000000-0000-0000-0008-000000000010', 'Espresso Martini',   2, 14.00, 'bar'),
(gen_random_uuid(), '00000000-0000-0000-0011-000000000001', '00000000-0000-0000-0008-000000000007', 'Nachos',             1,  9.00, 'kitchen'),
-- Order 2: Old Fashioned x2 = €26
(gen_random_uuid(), '00000000-0000-0000-0011-000000000002', '00000000-0000-0000-0008-000000000008', 'Old Fashioned',      2, 13.00, 'bar'),
-- Order 3: Happy Hour Mojito x3 + HH Wings x1 = €37
(gen_random_uuid(), '00000000-0000-0000-0011-000000000003', '00000000-0000-0000-0008-000000000001', 'Happy Hour Mojito',  3,  9.00, 'bar'),
(gen_random_uuid(), '00000000-0000-0000-0011-000000000003', '00000000-0000-0000-0008-000000000006', 'Happy Hour Wings',   1, 10.00, 'kitchen'),
-- Order 4: Negroni x2 + Beef Sliders x1 = €41
(gen_random_uuid(), '00000000-0000-0000-0011-000000000004', '00000000-0000-0000-0008-000000000009', 'Negroni',            2, 13.00, 'bar'),
(gen_random_uuid(), '00000000-0000-0000-0011-000000000004', '00000000-0000-0000-0008-000000000020', 'Beef Sliders',       1, 15.00, 'kitchen'),
-- Order 5: House Red x2 + Cheese Board x1 = €38
(gen_random_uuid(), '00000000-0000-0000-0011-000000000005', '00000000-0000-0000-0008-000000000015', 'House Red',          2, 11.00, 'bar'),
(gen_random_uuid(), '00000000-0000-0000-0011-000000000005', '00000000-0000-0000-0008-000000000019', 'Cheese Board',       1, 16.00, 'kitchen'),
-- Order 6: Manhattan x2 + Loaded Fries x1 = €39
(gen_random_uuid(), '00000000-0000-0000-0011-000000000006', '00000000-0000-0000-0008-000000000012', 'Manhattan',          2, 14.00, 'bar'),
(gen_random_uuid(), '00000000-0000-0000-0011-000000000006', '00000000-0000-0000-0008-000000000018', 'Loaded Fries',       1, 11.00, 'kitchen'),
-- Order 7: Espresso Martini x2 + IPA Pint x2 = €42
(gen_random_uuid(), '00000000-0000-0000-0011-000000000007', '00000000-0000-0000-0008-000000000010', 'Espresso Martini',   2, 14.00, 'bar'),
(gen_random_uuid(), '00000000-0000-0000-0011-000000000007', '00000000-0000-0000-0008-000000000005', 'IPA Pint',           2,  7.00, 'bar'),
-- Order 8: Aperol Spritz x2 + Nachos x1 = €33
(gen_random_uuid(), '00000000-0000-0000-0011-000000000008', '00000000-0000-0000-0008-000000000011', 'Aperol Spritz',      2, 12.00, 'bar'),
(gen_random_uuid(), '00000000-0000-0000-0011-000000000008', '00000000-0000-0000-0008-000000000007', 'Nachos',             1,  9.00, 'kitchen'),
-- Order 9: Old Fashioned x3 = €39
(gen_random_uuid(), '00000000-0000-0000-0011-000000000009', '00000000-0000-0000-0008-000000000008', 'Old Fashioned',      3, 13.00, 'bar'),
-- Order 10: Espresso Martini x2 + Cheese Board x1 = €44
(gen_random_uuid(), '00000000-0000-0000-0011-000000000010', '00000000-0000-0000-0008-000000000010', 'Espresso Martini',   2, 14.00, 'bar'),
(gen_random_uuid(), '00000000-0000-0000-0011-000000000010', '00000000-0000-0000-0008-000000000019', 'Cheese Board',       1, 16.00, 'kitchen'),
-- Order 11: Happy Hour Mojito x2 + HH Wings x2 = €38
(gen_random_uuid(), '00000000-0000-0000-0011-000000000011', '00000000-0000-0000-0008-000000000001', 'Happy Hour Mojito',  2,  9.00, 'bar'),
(gen_random_uuid(), '00000000-0000-0000-0011-000000000011', '00000000-0000-0000-0008-000000000006', 'Happy Hour Wings',   2, 10.00, 'kitchen'),
-- Order 12: Negroni x2 + Beef Sliders x1 = €41
(gen_random_uuid(), '00000000-0000-0000-0011-000000000012', '00000000-0000-0000-0008-000000000009', 'Negroni',            2, 13.00, 'bar'),
(gen_random_uuid(), '00000000-0000-0000-0011-000000000012', '00000000-0000-0000-0008-000000000020', 'Beef Sliders',       1, 15.00, 'kitchen'),
-- Order 13: Whisky Neat x3 = €36
(gen_random_uuid(), '00000000-0000-0000-0011-000000000013', '00000000-0000-0000-0008-000000000013', 'Whisky Neat',        3, 12.00, 'bar'),
-- Order 14: Manhattan x2 + Loaded Fries x1 = €39
(gen_random_uuid(), '00000000-0000-0000-0011-000000000014', '00000000-0000-0000-0008-000000000012', 'Manhattan',          2, 14.00, 'bar'),
(gen_random_uuid(), '00000000-0000-0000-0011-000000000014', '00000000-0000-0000-0008-000000000018', 'Loaded Fries',       1, 11.00, 'kitchen'),
-- Order 15: Prosecco x2 + House White x1 = €35
(gen_random_uuid(), '00000000-0000-0000-0011-000000000015', '00000000-0000-0000-0008-000000000017', 'Prosecco',           2, 12.00, 'bar'),
(gen_random_uuid(), '00000000-0000-0000-0011-000000000015', '00000000-0000-0000-0008-000000000016', 'House White',        1, 11.00, 'bar'),
-- Order 16: Espresso Martini x2 + Nachos x1 = €37
(gen_random_uuid(), '00000000-0000-0000-0011-000000000016', '00000000-0000-0000-0008-000000000010', 'Espresso Martini',   2, 14.00, 'bar'),
(gen_random_uuid(), '00000000-0000-0000-0011-000000000016', '00000000-0000-0000-0008-000000000007', 'Nachos',             1,  9.00, 'kitchen'),
-- Order 17: Old Fashioned x2 + HH Wings x1 = €36
(gen_random_uuid(), '00000000-0000-0000-0011-000000000017', '00000000-0000-0000-0008-000000000008', 'Old Fashioned',      2, 13.00, 'bar'),
(gen_random_uuid(), '00000000-0000-0000-0011-000000000017', '00000000-0000-0000-0008-000000000006', 'Happy Hour Wings',   1, 10.00, 'kitchen'),
-- Order 18: Gin & Tonic x3 + Beef Sliders x1 = €39
(gen_random_uuid(), '00000000-0000-0000-0011-000000000018', '00000000-0000-0000-0008-000000000003', 'Gin & Tonic',        3,  8.00, 'bar'),
(gen_random_uuid(), '00000000-0000-0000-0011-000000000018', '00000000-0000-0000-0008-000000000020', 'Beef Sliders',       1, 15.00, 'kitchen'),
-- Order 19: House Red x2 + Cheese Board x1 = €38
(gen_random_uuid(), '00000000-0000-0000-0011-000000000019', '00000000-0000-0000-0008-000000000015', 'House Red',          2, 11.00, 'bar'),
(gen_random_uuid(), '00000000-0000-0000-0011-000000000019', '00000000-0000-0000-0008-000000000019', 'Cheese Board',       1, 16.00, 'kitchen'),
-- Order 20: Negroni x2 + Draft Lager x2 = €38
(gen_random_uuid(), '00000000-0000-0000-0011-000000000020', '00000000-0000-0000-0008-000000000009', 'Negroni',            2, 13.00, 'bar'),
(gen_random_uuid(), '00000000-0000-0000-0011-000000000020', '00000000-0000-0000-0008-000000000004', 'Draft Lager',        2,  6.00, 'bar'),
-- Tonight. The Mojito is deliberate: it is the one menu item carrying a recipe, so
-- it is what gives the served round real 'sale' movements to inspect further down.
-- Order 21: Happy Hour Mojito x2 + Nachos x1 = EUR 27 (guest, from the table QR)
(gen_random_uuid(), '00000000-0000-0000-0011-000000000021', '00000000-0000-0000-0008-000000000001', 'Happy Hour Mojito',  2,  9.00, 'bar'),
(gen_random_uuid(), '00000000-0000-0000-0011-000000000021', '00000000-0000-0000-0008-000000000007', 'Nachos',             1,  9.00, 'kitchen'),
-- Order 22: Espresso Martini x2 + Loaded Fries x1 = EUR 39 (staff, still in progress)
(gen_random_uuid(), '00000000-0000-0000-0011-000000000022', '00000000-0000-0000-0008-000000000010', 'Espresso Martini',   2, 14.00, 'bar'),
(gen_random_uuid(), '00000000-0000-0000-0011-000000000022', '00000000-0000-0000-0008-000000000018', 'Loaded Fries',       1, 11.00, 'kitchen'),
-- Order 23: Aperol Spritz x4 + Beef Sliders x2 = EUR 78
(gen_random_uuid(), '00000000-0000-0000-0011-000000000023', '00000000-0000-0000-0008-000000000011', 'Aperol Spritz',      4, 12.00, 'bar'),
(gen_random_uuid(), '00000000-0000-0000-0011-000000000023', '00000000-0000-0000-0008-000000000020', 'Beef Sliders',       2, 15.00, 'kitchen'),
-- Order 24: House Red x2 + Cheese Board x1 = EUR 38
(gen_random_uuid(), '00000000-0000-0000-0011-000000000024', '00000000-0000-0000-0008-000000000015', 'House Red',          2, 11.00, 'bar'),
(gen_random_uuid(), '00000000-0000-0000-0011-000000000024', '00000000-0000-0000-0008-000000000019', 'Cheese Board',       1, 16.00, 'kitchen');

UPDATE order_line_items li
SET preparation_station_id = ps.id,
    preparation_station_name = ps.name,
    routes_to_all_stations = FALSE
FROM orders o, preparation_stations ps
WHERE o.id = li.order_id
  AND ps.business_id = o.business_id
  AND ps.name = CASE li.routing_tag WHEN 'bar' THEN 'Bar' ELSE 'Kitchen' END
  AND li.routing_tag <> 'any';

UPDATE order_line_items li
SET currency_code = 'EUR',
    tax_profile_id = tp.id,
    tax_profile_version_id = tv.id,
    tax_profile_name = tv.name,
    tax_profile_code = tp.code,
    tax_rate = tv.rate,
    price_includes_tax = tv.price_includes_tax,
    subtotal_amount = ROUND((li.unit_price * li.quantity) / (1 + tv.rate / 100), 2),
    tax_amount = (li.unit_price * li.quantity) - ROUND((li.unit_price * li.quantity) / (1 + tv.rate / 100), 2),
    total_amount = li.unit_price * li.quantity
FROM menu_items mi
JOIN tax_profiles tp ON tp.id = mi.tax_profile_id
JOIN tax_profile_versions tv ON tv.tax_profile_id = tp.id
WHERE li.item_id = mi.id
  AND li.order_id IN (
    SELECT id FROM orders WHERE business_id = '00000000-0000-0000-0000-000000000002'
  );

UPDATE orders o
SET currency_code = 'EUR',
    subtotal_amount = totals.subtotal_amount,
    tax_amount = totals.tax_amount,
    total_amount = totals.total_amount
FROM (
  SELECT order_id,
         SUM(subtotal_amount) AS subtotal_amount,
         SUM(tax_amount) AS tax_amount,
         SUM(total_amount) AS total_amount
  FROM order_line_items
  GROUP BY order_id
) totals
WHERE totals.order_id = o.id
  AND o.business_id = '00000000-0000-0000-0000-000000000002';

ALTER TABLE orders ALTER COLUMN currency_code DROP DEFAULT;
ALTER TABLE orders ALTER COLUMN subtotal_amount DROP DEFAULT;
ALTER TABLE orders ALTER COLUMN tax_amount DROP DEFAULT;
ALTER TABLE order_line_items ALTER COLUMN currency_code DROP DEFAULT;
ALTER TABLE order_line_items ALTER COLUMN tax_profile_name DROP DEFAULT;
ALTER TABLE order_line_items ALTER COLUMN tax_profile_code DROP DEFAULT;
ALTER TABLE order_line_items ALTER COLUMN tax_rate DROP DEFAULT;
ALTER TABLE order_line_items ALTER COLUMN price_includes_tax DROP DEFAULT;
ALTER TABLE order_line_items ALTER COLUMN subtotal_amount DROP DEFAULT;
ALTER TABLE order_line_items ALTER COLUMN tax_amount DROP DEFAULT;
ALTER TABLE order_line_items ALTER COLUMN total_amount DROP DEFAULT;
ALTER TABLE order_line_items ALTER COLUMN business_id DROP DEFAULT;

-- ─── Order Status Timeline ────────────────────────────────────────────────────
-- Each served order: received → preparing → ready → served
INSERT INTO order_status_timeline (id, business_id, order_id, status, changed_by, changed_at)
SELECT
  gen_random_uuid(),
  o.business_id,
  o.id,
  s.status,
  '00000000-0000-0000-0002-000000000012',  -- Demo Staff
  o.placed_at + s.offset_minutes * INTERVAL '1 minute'
FROM orders o
CROSS JOIN (
  VALUES ('received', 0), ('preparing', 2), ('ready', 10), ('served', 15)
) AS s(status, offset_minutes)
WHERE o.business_id = '00000000-0000-0000-0000-000000000002'
  -- Only a served order has walked the whole ladder. Tonight's in-progress round
  -- would otherwise be handed a 'served' entry it has not reached.
  AND o.status = 'served';

INSERT INTO order_status_timeline (id, business_id, order_id, status, changed_by, changed_at)
SELECT
  gen_random_uuid(), o.business_id, o.id, s.status,
  '00000000-0000-0000-0002-000000000013',  -- Demo Bartender
  o.placed_at + s.offset_minutes * INTERVAL '1 minute'
FROM orders o
CROSS JOIN (
  VALUES ('received', 0), ('preparing', 2)
) AS s(status, offset_minutes)
WHERE o.business_id = '00000000-0000-0000-0000-000000000002'
  AND o.status = 'preparing';

-- Line status tracks the order it belongs to. Migration 039 backfilled this for
-- rows that existed when it ran; seed rows are inserted afterwards and would
-- otherwise all sit at the 'received' default, so every historical ticket would
-- read as never started. The bar line of tonight's in-progress round is already
-- poured while the kitchen line is still on, which is what gives the two station
-- boards different work to show.
UPDATE order_line_items li
SET line_status = o.status
FROM orders o
WHERE o.id = li.order_id
  AND o.business_id = '00000000-0000-0000-0000-000000000002'
  AND o.status <> 'cancelled';

UPDATE order_line_items
SET line_status = 'ready'
WHERE order_id = '00000000-0000-0000-0011-000000000022'
  AND routing_tag = 'bar';

-- ─── Queue Entries (12 across 2 evenings) ─────────────────────────────────────
-- Friday -7 days: 5 entries (4 seated, 1 removed)
-- Saturday -6 days: 7 entries (4 seated, 3 removed)
-- The seed runs after all migrations. Give the legacy-shaped insert a temporary
-- value, then derive the authoritative venue-local service date and location.
ALTER TABLE queue_entries ALTER COLUMN service_date SET DEFAULT CURRENT_DATE;
INSERT INTO queue_entries (id, business_id, session_token_hash, name, party_size, phone, status, joined_at, called_at, seated_at, removed_at)
SELECT
  id::uuid,
  business_id::uuid,
  encode(digest(raw_token, 'sha256'), 'hex'),
  name,
  party_size,
  phone,
  status,
  joined_at,
  called_at,
  seated_at,
  removed_at
FROM (VALUES
-- Friday
('00000000-0000-0000-0013-000000000001', '00000000-0000-0000-0000-000000000002', 'pzl-q-fri-001', 'Mike Johnson',   3, '+14155552001', 'seated',
  DATE_TRUNC('day', NOW()) - INTERVAL '7 days' + INTERVAL '19 hours 30 minutes',
  DATE_TRUNC('day', NOW()) - INTERVAL '7 days' + INTERVAL '19 hours 45 minutes',
  DATE_TRUNC('day', NOW()) - INTERVAL '7 days' + INTERVAL '19 hours 50 minutes', NULL),
('00000000-0000-0000-0013-000000000002', '00000000-0000-0000-0000-000000000002', 'pzl-q-fri-002', 'Sarah Kim',      2, '+14155552002', 'seated',
  DATE_TRUNC('day', NOW()) - INTERVAL '7 days' + INTERVAL '19 hours 45 minutes',
  DATE_TRUNC('day', NOW()) - INTERVAL '7 days' + INTERVAL '20 hours 5 minutes',
  DATE_TRUNC('day', NOW()) - INTERVAL '7 days' + INTERVAL '20 hours 10 minutes', NULL),
('00000000-0000-0000-0013-000000000003', '00000000-0000-0000-0000-000000000002', 'pzl-q-fri-003', 'Tom Hayes',      4, '+14155552003', 'seated',
  DATE_TRUNC('day', NOW()) - INTERVAL '7 days' + INTERVAL '20 hours 15 minutes',
  DATE_TRUNC('day', NOW()) - INTERVAL '7 days' + INTERVAL '20 hours 30 minutes',
  DATE_TRUNC('day', NOW()) - INTERVAL '7 days' + INTERVAL '20 hours 35 minutes', NULL),
('00000000-0000-0000-0013-000000000004', '00000000-0000-0000-0000-000000000002', 'pzl-q-fri-004', 'Lisa Wu',        2, '+14155552004', 'removed',
  DATE_TRUNC('day', NOW()) - INTERVAL '7 days' + INTERVAL '20 hours 45 minutes',
  NULL, NULL,
  DATE_TRUNC('day', NOW()) - INTERVAL '7 days' + INTERVAL '21 hours'),
('00000000-0000-0000-0013-000000000005', '00000000-0000-0000-0000-000000000002', 'pzl-q-fri-005', 'Carlos Mendez',  3, '+14155552005', 'seated',
  DATE_TRUNC('day', NOW()) - INTERVAL '7 days' + INTERVAL '21 hours',
  DATE_TRUNC('day', NOW()) - INTERVAL '7 days' + INTERVAL '21 hours 15 minutes',
  DATE_TRUNC('day', NOW()) - INTERVAL '7 days' + INTERVAL '21 hours 20 minutes', NULL),
-- Saturday
('00000000-0000-0000-0013-000000000006', '00000000-0000-0000-0000-000000000002', 'pzl-q-sat-001', 'Emma Clarke',    4, '+14155552006', 'seated',
  DATE_TRUNC('day', NOW()) - INTERVAL '6 days' + INTERVAL '19 hours 15 minutes',
  DATE_TRUNC('day', NOW()) - INTERVAL '6 days' + INTERVAL '19 hours 35 minutes',
  DATE_TRUNC('day', NOW()) - INTERVAL '6 days' + INTERVAL '19 hours 40 minutes', NULL),
('00000000-0000-0000-0013-000000000007', '00000000-0000-0000-0000-000000000002', 'pzl-q-sat-002', 'Jake Novak',     2, '+14155552007', 'seated',
  DATE_TRUNC('day', NOW()) - INTERVAL '6 days' + INTERVAL '19 hours 30 minutes',
  DATE_TRUNC('day', NOW()) - INTERVAL '6 days' + INTERVAL '19 hours 50 minutes',
  DATE_TRUNC('day', NOW()) - INTERVAL '6 days' + INTERVAL '19 hours 55 minutes', NULL),
('00000000-0000-0000-0013-000000000008', '00000000-0000-0000-0000-000000000002', 'pzl-q-sat-003', 'Priya Singh',    3, '+14155552008', 'seated',
  DATE_TRUNC('day', NOW()) - INTERVAL '6 days' + INTERVAL '20 hours',
  DATE_TRUNC('day', NOW()) - INTERVAL '6 days' + INTERVAL '20 hours 15 minutes',
  DATE_TRUNC('day', NOW()) - INTERVAL '6 days' + INTERVAL '20 hours 20 minutes', NULL),
('00000000-0000-0000-0013-000000000009', '00000000-0000-0000-0000-000000000002', 'pzl-q-sat-004', 'Ben Chang',      2, '+14155552009', 'removed',
  DATE_TRUNC('day', NOW()) - INTERVAL '6 days' + INTERVAL '20 hours 30 minutes',
  NULL, NULL,
  DATE_TRUNC('day', NOW()) - INTERVAL '6 days' + INTERVAL '20 hours 45 minutes'),
('00000000-0000-0000-0013-000000000010', '00000000-0000-0000-0000-000000000002', 'pzl-q-sat-005', 'Olivia Scott',   5, '+14155552010', 'seated',
  DATE_TRUNC('day', NOW()) - INTERVAL '6 days' + INTERVAL '20 hours 45 minutes',
  DATE_TRUNC('day', NOW()) - INTERVAL '6 days' + INTERVAL '21 hours 5 minutes',
  DATE_TRUNC('day', NOW()) - INTERVAL '6 days' + INTERVAL '21 hours 10 minutes', NULL),
('00000000-0000-0000-0013-000000000011', '00000000-0000-0000-0000-000000000002', 'pzl-q-sat-006', 'Matt Zhou',      2, '+14155552011', 'removed',
  DATE_TRUNC('day', NOW()) - INTERVAL '6 days' + INTERVAL '21 hours 30 minutes',
  NULL, NULL,
  DATE_TRUNC('day', NOW()) - INTERVAL '6 days' + INTERVAL '21 hours 50 minutes'),
('00000000-0000-0000-0013-000000000012', '00000000-0000-0000-0000-000000000002', 'pzl-q-sat-007', 'Hannah Park',    3, '+14155552012', 'removed',
  DATE_TRUNC('day', NOW()) - INTERVAL '6 days' + INTERVAL '22 hours',
  NULL, NULL,
  DATE_TRUNC('day', NOW()) - INTERVAL '6 days' + INTERVAL '22 hours 15 minutes'),
-- Tonight, still waiting. The twelve entries above are all terminal and days old,
-- so on their own they leave the live queue board empty and nothing to seat: an
-- assignment only reads as active while its entry is waiting or called. These
-- three are the ones a host actually works. Phones must differ from each other —
-- a partial unique index forbids two active entries sharing a number.
('00000000-0000-0000-0013-000000000013', '00000000-0000-0000-0000-000000000002', 'pzl-q-tonight-001', 'Nina Brandt',    2, '+14155552013', 'waiting',
  NOW() - INTERVAL '12 minutes', NULL, NULL, NULL),
('00000000-0000-0000-0013-000000000014', '00000000-0000-0000-0000-000000000002', 'pzl-q-tonight-002', 'Omar Haddad',    4, '+14155552014', 'called',
  NOW() - INTERVAL '25 minutes',
  NOW() - INTERVAL '5 minutes', NULL, NULL),
('00000000-0000-0000-0013-000000000015', '00000000-0000-0000-0000-000000000002', 'pzl-q-tonight-003', 'Ines Vogel',     3, '+14155552015', 'waiting',
  NOW() - INTERVAL '6 minutes', NULL, NULL, NULL)
) AS seeded_queue_entries(
  id, business_id, raw_token, name, party_size, phone, status,
  joined_at, called_at, seated_at, removed_at
);

UPDATE queue_entries qe
SET location_id = location.id,
    service_date = (
      qe.joined_at AT TIME ZONE business.timezone
      - (business.service_day_cutoff - TIME '00:00')
    )::date
FROM businesses business
JOIN locations location
  ON location.business_id = business.id AND location.is_primary = TRUE
WHERE qe.business_id = business.id;
ALTER TABLE queue_entries ALTER COLUMN service_date DROP DEFAULT;

-- ─── Business Daily Metrics (42 days) ─────────────────────────────────────────
-- Used by the ML pipeline for forecasting. Weekend days have higher traffic.
INSERT INTO business_daily_metrics (
  id, business_id, date,
  total_reservations, completed_reservations, cancelled_reservations,
  no_show_count, total_guests,
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
-- container-receive flow are demoable.
-- default_pour_ml is an optional reference size for the rough "~N pours left (est.)"
-- staff estimate (independent of any recipe). Set here so the estimate is demoable.
INSERT INTO inventory_items
  (id, business_id, name, unit, unit_type, container_volume_ml, default_pour_ml, current_quantity, par_quantity, cost_per_unit, weighted_average_cost, cost_currency_code, base_unit, dimension) VALUES
-- White rum: 5 × 750 ml bottles received, ~1.5 bottles poured out → 2625 ml, below par.
('00000000-0000-0000-0010-000000000021', '00000000-0000-0000-0000-000000000002', 'White Rum (pour)',  'ml', 'bottle',   750,   44, 2625, 3000, 0.04, 0.04, 'EUR', 'ml', 'volume'),
('00000000-0000-0000-0010-000000000022', '00000000-0000-0000-0000-000000000002', 'Lime Juice (pour)', 'ml', 'bottle',  1000,   15, 10150, 2000, 0.01, 0.008824, 'EUR', 'ml', 'volume'),
('00000000-0000-0000-0010-000000000023', '00000000-0000-0000-0000-000000000002', 'Soda Water (keg)',  'ml', 'keg',    20000,  120, 15000, 8000, 0.002, 0.002, 'EUR', 'ml', 'volume');

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

-- ─── Stage 5: purchasing, pack conversions and a reconciled count ─────────────
-- Only enough to exercise stage-5 invariants; the full pilot scenario is stage 8.
-- Every row hangs off the demo business, so the DELETE FROM businesses cleanup
-- at the top of this file keeps a re-run idempotent.
--
-- The arithmetic below is deliberate: Lime Juice above reads 10150 ml, which is
-- 4200 already on the ledger, plus a 6000 ml delivery received here, minus a
-- 50 ml shortfall found by the reconciled count.

-- Packs are conversion metadata, never a second balance.
INSERT INTO inventory_pack_conversions
  (id, business_id, inventory_item_id, label, pack_unit, base_quantity, is_default_receiving_unit) VALUES
('00000000-0000-0044-0000-000000000001', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0010-000000000021', 'Case of 6 x 750 ml', 'case', 4500, TRUE),
('00000000-0000-0044-0000-000000000002', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0010-000000000021', 'Single bottle 750 ml', 'bottle', 750, FALSE),
('00000000-0000-0044-0000-000000000003', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0010-000000000022', 'Case of 6 x 1 L', 'case', 6000, TRUE),
('00000000-0000-0044-0000-000000000004', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0010-000000000023', 'Keg 20 L', 'keg', 20000, TRUE);

INSERT INTO suppliers (id, business_id, name, contact_name, email, phone, notes) VALUES
('00000000-0000-0045-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'Rheinland Getranke', 'Katrin Vogel', 'orders@rheinland-getraenke.example', '+4922112345678', 'Delivers Tuesdays and Fridays.');

-- lead_time_days is what makes a reorder suggestion explainable rather than a
-- bare par-minus-on-hand number.
INSERT INTO supplier_products
  (id, business_id, supplier_id, inventory_item_id, supplier_sku, product_name, pack_conversion_id, lead_time_days, last_price, currency_code) VALUES
('00000000-0000-0045-0000-000000000011', '00000000-0000-0000-0000-000000000002', '00000000-0000-0045-0000-000000000001', '00000000-0000-0000-0010-000000000021', 'RUM-750-6',  'White rum, case of 6', '00000000-0000-0044-0000-000000000001', 3, 180.00, 'EUR'),
('00000000-0000-0045-0000-000000000012', '00000000-0000-0000-0000-000000000002', '00000000-0000-0045-0000-000000000001', '00000000-0000-0000-0010-000000000022', 'LIME-1L-6',  'Lime juice, case of 6', '00000000-0000-0044-0000-000000000003', 2,  48.00, 'EUR');

-- Part received: the lime juice arrived, the rum has not. This is what puts a
-- non-zero "on order" term into the reorder explanation.
INSERT INTO purchase_orders
  (id, business_id, supplier_id, status, reference, expected_on, note, created_by, approved_by, approved_at, ordered_at) VALUES
('00000000-0000-0045-0000-000000000021', '00000000-0000-0000-0000-000000000002', '00000000-0000-0045-0000-000000000001', 'partially_received', 'PO-2026-014', CURRENT_DATE + 2, 'Standing weekly order.', '00000000-0000-0000-0002-000000000010', '00000000-0000-0000-0002-000000000010', NOW() - INTERVAL '5 days', NOW() - INTERVAL '5 days');

-- Quantities count PACKS and unit_price is per pack, not per base unit.
INSERT INTO purchase_order_lines
  (id, business_id, purchase_order_id, supplier_product_id, inventory_item_id, description, ordered_quantity, received_quantity, pack_conversion_id, unit_price, currency_code) VALUES
('00000000-0000-0045-0000-000000000031', '00000000-0000-0000-0000-000000000002', '00000000-0000-0045-0000-000000000021', '00000000-0000-0045-0000-000000000011', '00000000-0000-0000-0010-000000000021', 'White rum, case of 6',  2, 0, '00000000-0000-0044-0000-000000000001', 180.00, 'EUR'),
('00000000-0000-0045-0000-000000000032', '00000000-0000-0000-0000-000000000002', '00000000-0000-0045-0000-000000000021', '00000000-0000-0045-0000-000000000012', '00000000-0000-0000-0010-000000000022', 'Lime juice, case of 6', 2, 1, '00000000-0000-0044-0000-000000000003',  48.00, 'EUR');

-- The delivery, and the ordinary stock movement it produced. Receipts never
-- write a balance directly; they go through the same ledger as everything else.
INSERT INTO stock_movements
  (id, business_id, item_id, movement_type, quantity_delta, notes, created_by, alert_triggered, unit_cost_snapshot, cost_currency_code, reference_type, reference_id, created_at) VALUES
('00000000-0000-0011-0000-000000000001', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0010-000000000022', 'receive', 6000, 'Purchase order PO-2026-014', '00000000-0000-0000-0002-000000000010', FALSE, 0.008, 'EUR', 'purchase_receipt', '00000000-0000-0045-0000-000000000041', NOW() - INTERVAL '3 days');

INSERT INTO purchase_receipts
  (id, business_id, purchase_order_id, delivery_reference, invoice_reference, received_at, received_by, idempotency_key, request_fingerprint, note) VALUES
('00000000-0000-0045-0000-000000000041', '00000000-0000-0000-0000-000000000002', '00000000-0000-0045-0000-000000000021', 'DN-88213', 'INV-2026-0451', NOW() - INTERVAL '3 days', '00000000-0000-0000-0002-000000000010', 'seed-receipt-po-2026-014', NULL, 'Rum backordered.');

INSERT INTO purchase_receipt_lines
  (id, business_id, receipt_id, purchase_order_line_id, inventory_item_id, received_quantity, unit_price, currency_code, discrepancy_reason, stock_movement_id) VALUES
('00000000-0000-0045-0000-000000000051', '00000000-0000-0000-0000-000000000002', '00000000-0000-0045-0000-000000000041', '00000000-0000-0045-0000-000000000032', '00000000-0000-0000-0010-000000000022', 1, 48.00, 'EUR', NULL, '00000000-0000-0011-0000-000000000001');

-- Per BASE unit, unlike the lines above: 48.00 EUR / 6000 ml.
INSERT INTO purchase_price_history
  (id, business_id, supplier_product_id, inventory_item_id, receipt_line_id, unit_cost_per_base_unit, currency_code, observed_at) VALUES
('00000000-0000-0045-0000-000000000061', '00000000-0000-0000-0000-000000000002', '00000000-0000-0045-0000-000000000012', '00000000-0000-0000-0010-000000000022', '00000000-0000-0045-0000-000000000051', 0.008000, 'EUR', NOW() - INTERVAL '3 days');

-- A reconciled stocktake that found 50 ml missing, with a reason. The shortfall
-- is a waste movement, so the balance still equals the sum of the ledger.
INSERT INTO stock_movements
  (id, business_id, item_id, movement_type, quantity_delta, reason, notes, created_by, alert_triggered, unit_cost_snapshot, cost_currency_code, reference_type, reference_id, created_at) VALUES
('00000000-0000-0011-0000-000000000002', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0010-000000000022', 'waste', -50, 'other', 'spillage: Measured short at the rail', '00000000-0000-0000-0002-000000000010', FALSE, 0.008824, 'EUR', 'count_reconciliation', '00000000-0000-0046-0000-000000000001', NOW() - INTERVAL '1 day');

INSERT INTO inventory_count_sessions
  (id, business_id, kind, status, note, opened_by, reconciled_by, reconciled_at, created_at) VALUES
('00000000-0000-0046-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'cycle_count', 'reconciled', 'Weekly rail check.', '00000000-0000-0000-0002-000000000010', '00000000-0000-0000-0002-000000000010', NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day');

INSERT INTO inventory_count_lines
  (id, business_id, session_id, inventory_item_id, book_quantity, counted_quantity, variance_quantity, shrinkage_reason, note, movement_id, entry_mode, entry_value, entry_pack_conversion_id) VALUES
('00000000-0000-0046-0000-000000000011', '00000000-0000-0000-0000-000000000002', '00000000-0000-0046-0000-000000000001', '00000000-0000-0000-0010-000000000022', 10200, 10150, -50, 'spillage', 'Measured short at the rail', '00000000-0000-0011-0000-000000000002', 'base_unit', NULL, NULL);

-- ─── Tonight's service: assignments, seatings, tabs, external settlement ──────
-- Everything from here to the cost stamp below is the live state that makes the
-- pilot journey walkable on seeded data: a party that ate and settled at the
-- venue's own register, a party still at the table with an open tab, planned
-- tables for the days ahead, a queue with people in it, and a waitlist with one
-- live offer. Placed before the cost stamp so the sale movements it writes are
-- picked up by it rather than needing a second copy of that statement.

-- One location means every row belongs to it. Leaving these NULL is what made the
-- queue read as location-less and the table figures half-populated.
UPDATE reservations SET location_id = '00000000-0000-0005-0000-000000000001'
WHERE business_id = '00000000-0000-0000-0000-000000000002';

UPDATE orders SET location_id = '00000000-0000-0005-0000-000000000001'
WHERE business_id = '00000000-0000-0000-0000-000000000002';

-- The historical orders already carry a free-text table label. Now that the
-- labels exist as real tables, point the orders at them so table utilisation
-- reports over a whole floor rather than a seventh of one.
UPDATE orders o
SET table_id = t.id
FROM tables t
WHERE t.business_id = o.business_id
  AND t.label = o.table_identifier
  AND o.business_id = '00000000-0000-0000-0000-000000000002';

UPDATE orders SET channel = 'qr',    customer_id = '00000000-0000-0000-0001-000000000014' WHERE id = '00000000-0000-0000-0011-000000000021';
UPDATE orders SET channel = 'staff', customer_id = '00000000-0000-0000-0001-000000000014' WHERE id = '00000000-0000-0000-0011-000000000022';
UPDATE orders SET channel = 'staff', customer_id = '00000000-0000-0000-0001-000000000011' WHERE id IN ('00000000-0000-0000-0011-000000000023', '00000000-0000-0000-0011-000000000024');

-- ─── Table Assignments (planning, not occupancy) ──────────────────────────────
-- An assignment plans a table for a booking; the table stays available to walk-ins
-- until a seating opens. The two tonight rows are assigned as well as seated,
-- because that is the order the floor board itself does it in.
INSERT INTO reservation_table_assignments (reservation_id, table_id, business_id, location_id, assigned_by, assigned_at) VALUES
-- Tonight, both now seated
('00000000-0000-0000-0005-000000000039', '00000000-0000-0024-0000-000000000215', '00000000-0000-0000-0000-000000000002', '00000000-0000-0005-0000-000000000001', '00000000-0000-0000-0002-000000000012', NOW() - INTERVAL '3 hours 10 minutes'),
('00000000-0000-0000-0005-000000000039', '00000000-0000-0024-0000-000000000216', '00000000-0000-0000-0000-000000000002', '00000000-0000-0005-0000-000000000001', '00000000-0000-0000-0002-000000000012', NOW() - INTERVAL '3 hours 10 minutes'),
('00000000-0000-0000-0005-000000000040', '00000000-0000-0024-0000-000000000213', '00000000-0000-0000-0000-000000000002', '00000000-0000-0005-0000-000000000001', '00000000-0000-0000-0002-000000000012', NOW() - INTERVAL '50 minutes'),
-- Planned for the days ahead, nobody seated
('00000000-0000-0000-0005-000000000034', '00000000-0000-0024-0000-000000000211', '00000000-0000-0000-0000-000000000002', '00000000-0000-0005-0000-000000000001', '00000000-0000-0000-0002-000000000012', NOW() - INTERVAL '1 hour'),
('00000000-0000-0000-0005-000000000035', '00000000-0000-0024-0000-000000000212', '00000000-0000-0000-0000-000000000002', '00000000-0000-0005-0000-000000000001', '00000000-0000-0000-0002-000000000012', NOW() - INTERVAL '1 hour'),
('00000000-0000-0000-0005-000000000022', '00000000-0000-0024-0000-000000000220', '00000000-0000-0000-0000-000000000002', '00000000-0000-0005-0000-000000000001', '00000000-0000-0000-0002-000000000012', NOW() - INTERVAL '1 hour');

-- The called queue party has a table held for it but has not sat down yet.
INSERT INTO queue_table_assignments (queue_entry_id, table_id, business_id, location_id, assigned_by, assigned_at) VALUES
('00000000-0000-0000-0013-000000000014', '00000000-0000-0024-0000-000000000217', '00000000-0000-0000-0000-000000000002', '00000000-0000-0005-0000-000000000001', '00000000-0000-0000-0002-000000000012', NOW() - INTERVAL '5 minutes');

-- ─── Seatings (occupancy) ─────────────────────────────────────────────────────
-- A seating is what actually makes a table read as occupied; there is no column
-- for it. The closed one used the Main Room T5 + T6 combination, which is the
-- only way a multi-table allocation is permitted.
INSERT INTO table_seatings (id, business_id, location_id, reservation_id, queue_entry_id, party_size, status, opened_by, opened_at, closed_by, closed_at, created_at, updated_at) VALUES
('00000000-0000-0024-0000-000000000401', '00000000-0000-0000-0000-000000000002', '00000000-0000-0005-0000-000000000001', '00000000-0000-0000-0005-000000000039', NULL, 4, 'closed', '00000000-0000-0000-0002-000000000012', NOW() - INTERVAL '2 hours 45 minutes', '00000000-0000-0000-0002-000000000012', NOW() - INTERVAL '45 minutes', NOW() - INTERVAL '2 hours 45 minutes', NOW() - INTERVAL '45 minutes'),
('00000000-0000-0024-0000-000000000402', '00000000-0000-0000-0000-000000000002', '00000000-0000-0005-0000-000000000001', '00000000-0000-0000-0005-000000000040', NULL, 2, 'open',   '00000000-0000-0000-0002-000000000012', NOW() - INTERVAL '40 minutes', NULL, NULL, NOW() - INTERVAL '40 minutes', NOW() - INTERVAL '40 minutes');

INSERT INTO table_seating_tables (seating_id, table_id) VALUES
('00000000-0000-0024-0000-000000000401', '00000000-0000-0024-0000-000000000215'),
('00000000-0000-0024-0000-000000000401', '00000000-0000-0024-0000-000000000216'),
('00000000-0000-0024-0000-000000000402', '00000000-0000-0024-0000-000000000213');

-- ─── Tabs ─────────────────────────────────────────────────────────────────────
-- No running total is stored: a tab's total is summed from its orders on demand.
-- The settled tab leaves closed_at, closed_by and the legacy settled_method NULL
-- because recording an external settlement does not write them — the settlement
-- event is the record, and seeded rows should look like rows the product wrote.
INSERT INTO tabs (id, business_id, table_id, customer_id, seating_id, status, channel, opened_by, opened_at, created_at, updated_at) VALUES
('00000000-0000-0016-0000-000000000001', '00000000-0000-0000-0000-000000000002', '00000000-0000-0024-0000-000000000215', '00000000-0000-0000-0001-000000000011', '00000000-0000-0024-0000-000000000401', 'settled_externally', 'staff', '00000000-0000-0000-0002-000000000012', NOW() - INTERVAL '2 hours 40 minutes', NOW() - INTERVAL '2 hours 40 minutes', NOW() - INTERVAL '50 minutes'),
('00000000-0000-0016-0000-000000000002', '00000000-0000-0000-0000-000000000002', '00000000-0000-0024-0000-000000000213', '00000000-0000-0000-0001-000000000014', '00000000-0000-0024-0000-000000000402', 'open',               'qr',    '00000000-0000-0000-0002-000000000012', NOW() - INTERVAL '38 minutes',       NOW() - INTERVAL '38 minutes',       NOW() - INTERVAL '8 minutes');

UPDATE orders SET tab_id = '00000000-0000-0016-0000-000000000001'
WHERE id IN ('00000000-0000-0000-0011-000000000023', '00000000-0000-0000-0011-000000000024');
UPDATE orders SET tab_id = '00000000-0000-0016-0000-000000000002'
WHERE id IN ('00000000-0000-0000-0011-000000000021', '00000000-0000-0000-0011-000000000022');

-- ─── External settlement ──────────────────────────────────────────────────────
-- Crowbar does not take payment and holds no fiscal authority. This row records a
-- staff assertion that the venue's own compliant register completed settlement,
-- and snapshots the tab total at the moment it was recorded. informational_method
-- stays deliberately unspecific: the register, not this record, knows how it was
-- settled. The snapshot is summed rather than written by hand so it cannot drift
-- from the totals the line rollup above computed.
INSERT INTO tab_settlement_events (id, business_id, tab_id, event_type, actor_id, occurred_at, currency_code, total_snapshot, informational_method, note, external_register_reference)
SELECT
  '00000000-0000-0040-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0016-0000-000000000001',
  'settled_externally',
  '00000000-0000-0000-0002-000000000012',
  NOW() - INTERVAL '50 minutes',
  'EUR',
  COALESCE(SUM(o.total_amount), 0),
  'other',
  'Recorded at the register before the party left.',
  'REG-1/0247'
FROM orders o
WHERE o.tab_id = '00000000-0000-0016-0000-000000000001'
  AND o.status <> 'cancelled';

UPDATE tabs SET current_settlement_event_id = '00000000-0000-0040-0000-000000000001'
WHERE id = '00000000-0000-0016-0000-000000000001';

-- ─── Stock deducted by what was actually served ───────────────────────────────
-- Written the way fulfilment writes it: one movement per recipe ingredient,
-- carrying both the order and the line it came from, so a reversal can undo
-- exactly what was deducted instead of re-reading the current recipe.
INSERT INTO stock_movements (id, business_id, item_id, movement_type, quantity_delta, notes, created_by, order_id, order_line_item_id, created_at)
SELECT
  gen_random_uuid(),
  li.business_id,
  ing.inventory_item_id,
  'sale',
  -(ing.quantity * li.quantity),
  'Deducted on fulfilment',
  '00000000-0000-0000-0002-000000000013',
  li.order_id,
  li.id,
  o.placed_at + INTERVAL '15 minutes'
FROM order_line_items li
JOIN menu_item_ingredients ing ON ing.menu_item_id = li.item_id
JOIN orders o ON o.id = li.order_id
WHERE o.id = '00000000-0000-0000-0011-000000000021';

-- On-hand has to agree with the ledger, or the first screen a reader opens
-- contradicts the second.
UPDATE inventory_items i
SET current_quantity = i.current_quantity + m.delta
FROM (
  SELECT sm.item_id, SUM(sm.quantity_delta) AS delta
  FROM stock_movements sm
  WHERE sm.order_id = '00000000-0000-0000-0011-000000000021'
  GROUP BY sm.item_id
) m
WHERE i.id = m.item_id;

-- ─── Waitlist (future-booking interest, not the queue) ────────────────────────
-- One guest waiting to be offered a slot, and one holding a live offer. An
-- offered row must carry all three offer columns, and its expiry has to be in the
-- future or the expiry sweep turns it terminal the moment anything reads it.
INSERT INTO reservation_waitlist_entries (id, business_id, service_type_id, customer_id, requested_starts_at, flexible_until, guests, status, offered_at, offered_reservation_time, offer_expires_at, created_by, created_at, updated_at) VALUES
('00000000-0000-0030-0000-000000000001', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0004-000000000010', '00000000-0000-0000-0001-000000000020',
  (DATE_TRUNC('day', NOW() AT TIME ZONE 'Europe/Berlin') + INTERVAL '2 days' + INTERVAL '20 hours') AT TIME ZONE 'Europe/Berlin',
  (DATE_TRUNC('day', NOW() AT TIME ZONE 'Europe/Berlin') + INTERVAL '2 days' + INTERVAL '23 hours') AT TIME ZONE 'Europe/Berlin',
  2, 'waiting', NULL, NULL, NULL, '00000000-0000-0000-0002-000000000012', NOW() - INTERVAL '2 hours', NOW() - INTERVAL '2 hours'),
('00000000-0000-0030-0000-000000000002', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0004-000000000010', '00000000-0000-0000-0001-000000000017',
  (DATE_TRUNC('day', NOW() AT TIME ZONE 'Europe/Berlin') + INTERVAL '1 day' + INTERVAL '20 hours') AT TIME ZONE 'Europe/Berlin',
  (DATE_TRUNC('day', NOW() AT TIME ZONE 'Europe/Berlin') + INTERVAL '1 day' + INTERVAL '23 hours') AT TIME ZONE 'Europe/Berlin',
  2, 'offered', NOW() - INTERVAL '10 minutes',
  (DATE_TRUNC('day', NOW() AT TIME ZONE 'Europe/Berlin') + INTERVAL '1 day' + INTERVAL '20 hours') AT TIME ZONE 'Europe/Berlin',
  NOW() + INTERVAL '20 minutes', '00000000-0000-0000-0002-000000000012', NOW() - INTERVAL '1 day', NOW() - INTERVAL '10 minutes');

-- ─── A guest waiting to be let onto the table's tab ───────────────────────────
-- Scanning a table QR creates a session a staff member approves. This one is left
-- pending so the approval queue is not empty. Its token hash is opaque by design
-- and no browser holds the plaintext, so it can only ever be approved or denied
-- from the staff side — it is a fixture for that screen, not a usable credential.
INSERT INTO table_guest_sessions (id, business_id, location_id, table_id, seating_id, table_qr_revision, browser_nonce_hash, token_hash, status, expires_at, created_at, updated_at) VALUES
('00000000-0000-0041-0000-000000000001', '00000000-0000-0000-0000-000000000002', '00000000-0000-0005-0000-000000000001', '00000000-0000-0024-0000-000000000213', '00000000-0000-0024-0000-000000000402', 1,
  encode(digest('voltvine-guest-nonce-tonight-001', 'sha256'), 'hex'),
  encode(digest('voltvine-guest-token-tonight-001', 'sha256'), 'hex'),
  'pending', NOW() + INTERVAL '25 minutes', NOW() - INTERVAL '3 minutes', NOW() - INTERVAL '3 minutes');

-- Migration 044 stamps a cost onto movements that existed when it ran. Seed rows
-- are inserted afterwards, so the demo's historic movements would otherwise carry
-- no cost and every COGS figure would honestly report itself incomplete. Stamping
-- them from the item's cost mirrors what 044 does, and leaves the Stage 5 rows
-- above alone because they already carry their own snapshot.
UPDATE stock_movements m
SET unit_cost_snapshot = i.weighted_average_cost,
    cost_currency_code = i.cost_currency_code
FROM inventory_items i
WHERE i.id = m.item_id
  AND m.business_id = '00000000-0000-0000-0000-000000000002'
  AND m.unit_cost_snapshot IS NULL;
