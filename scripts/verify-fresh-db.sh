#!/usr/bin/env bash

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERIFY_DB="${CROWBAR_VERIFY_DB:-crowbar_verify_mvp}"
VERIFY_DEMO_PASSWORD="${CROWBAR_VERIFY_DEMO_PASSWORD:-$(openssl rand -hex 16)}"

if [[ ! "$VERIFY_DB" =~ ^crowbar_verify_[a-z0-9_]+$ ]]; then
  echo "Verification database must start with crowbar_verify_ and use lowercase letters, digits, or underscores." >&2
  exit 2
fi

cleanup() {
  if [[ "${KEEP_CROWBAR_VERIFY_DB:-0}" != "1" ]]; then
    docker exec crowbar-db dropdb --if-exists --force -U postgres "$VERIFY_DB" >/dev/null
  fi
}
trap cleanup EXIT

docker exec crowbar-db dropdb --if-exists --force -U postgres "$VERIFY_DB" >/dev/null
docker exec crowbar-db createdb -U postgres "$VERIFY_DB"

cd "$ROOT/server"
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/$VERIFY_DB" \
  SEED_DATA=true \
  DEMO_ADMIN_PASSWORD="$VERIFY_DEMO_PASSWORD" \
  venv/bin/python -m db.migrate

# The canonical seed is replacement-based and must be safe to repeat.
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/$VERIFY_DB" \
  DEMO_ADMIN_PASSWORD="$VERIFY_DEMO_PASSWORD" \
  venv/bin/python -m db.migrate seed

EXPECTED_MIGRATIONS="$(find db/migrations -maxdepth 1 -name '*.sql' | wc -l | tr -d ' ')"
docker exec crowbar-db psql -v ON_ERROR_STOP=1 -v expected="$EXPECTED_MIGRATIONS" \
  -U postgres -d "$VERIFY_DB" <<'SQL'
DO $$
BEGIN
  IF (SELECT COUNT(*) FROM _migrations) <> :'expected'::integer THEN
    RAISE EXCEPTION 'migration count mismatch';
  END IF;
  IF (SELECT COUNT(*) FROM businesses WHERE slug = 'volt-and-vine') <> 1 THEN
    RAISE EXCEPTION 'synthetic Volt & Vine tenant missing or duplicated';
  END IF;
  -- One demo account per pilot role, so the stage-6 permission matrix can be
  -- checked by signing in rather than by reading a table.
  IF (SELECT COUNT(DISTINCT s.role) FROM staff s JOIN businesses b ON b.id = s.business_id
      WHERE b.slug = 'volt-and-vine'
        AND s.role IN ('owner', 'manager', 'host_server', 'bar_kitchen',
                       'inventory_operator')) <> 5 THEN
    RAISE EXCEPTION 'canonical staff-role seed is invalid';
  END IF;
  -- Migration 049 retired the old catch-all role; a leftover row means the
  -- backfill did not run.
  IF EXISTS (SELECT 1 FROM staff WHERE role = 'staff') THEN
    RAISE EXCEPTION 'a legacy staff role survived the 049 backfill';
  END IF;
  IF EXISTS (SELECT 1 FROM staff_invitations WHERE role = 'staff') THEN
    RAISE EXCEPTION 'a legacy staff invitation role survived the 049 backfill';
  END IF;
  IF EXISTS (
    SELECT 1 FROM service_types
    WHERE allocation_mode = 'legacy' AND max_concurrent_bookings IS NULL
  ) THEN
    RAISE EXCEPTION 'legacy service concurrency invariant failed';
  END IF;
  IF EXISTS (
    SELECT 1 FROM orders
    WHERE request_fingerprint IS NULL OR total_amount < 0
       OR currency_code IS NULL OR subtotal_amount IS NULL OR tax_amount IS NULL
  ) THEN
    RAISE EXCEPTION 'order authority backfill invariant failed';
  END IF;
  IF (SELECT COUNT(*) FROM businesses
      WHERE slug = 'volt-and-vine' AND country_code = 'DE' AND currency_code = 'EUR'
        AND locale = 'de-DE' AND timezone = 'Europe/Berlin') <> 1 THEN
    RAISE EXCEPTION 'canonical regional configuration is invalid';
  END IF;
  IF (SELECT COUNT(*) FROM tax_profiles tp JOIN businesses b ON b.id = tp.business_id
      WHERE b.slug = 'volt-and-vine' AND tp.code IN ('STANDARD', 'REDUCED', 'EXEMPT', 'CUSTOM')) <> 4 THEN
    RAISE EXCEPTION 'canonical operational tax profiles are invalid';
  END IF;
  IF EXISTS (
    SELECT 1 FROM order_line_items
    WHERE currency_code IS NULL OR tax_profile_id IS NULL
       OR tax_profile_version_id IS NULL OR tax_profile_name IS NULL
       OR tax_rate IS NULL OR subtotal_amount IS NULL OR tax_amount IS NULL
       OR total_amount IS NULL
  ) THEN
    RAISE EXCEPTION 'order tax snapshot invariant failed';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM orders o
    JOIN (
      SELECT order_id, SUM(subtotal_amount) subtotal_amount,
             SUM(tax_amount) tax_amount, SUM(total_amount) total_amount
      FROM order_line_items GROUP BY order_id
    ) lines ON lines.order_id = o.id
    WHERE o.subtotal_amount <> lines.subtotal_amount
       OR o.tax_amount <> lines.tax_amount OR o.total_amount <> lines.total_amount
  ) THEN
    RAISE EXCEPTION 'order tax totals do not reconcile to lines';
  END IF;
  IF to_regclass('public.inventory_discrepancies') IS NULL
     OR to_regclass('public.delivery_attempts') IS NULL
     OR to_regclass('public.password_reset_tokens') IS NULL
     OR to_regclass('public.business_regional_audits') IS NULL
     OR to_regclass('public.tax_profile_versions') IS NULL
     OR to_regclass('public.queue_service_days') IS NULL
     OR to_regclass('public.queue_entry_events') IS NULL
     OR to_regclass('public.preparation_stations') IS NULL
     OR to_regclass('public.order_line_status_timeline') IS NULL
     OR to_regclass('public.order_revisions') IS NULL
     OR to_regclass('public.menu_item_availability_events') IS NULL
     OR to_regclass('public.tab_settlement_events') IS NULL THEN
    RAISE EXCEPTION 'current integrity tables are missing';
  END IF;
  IF EXISTS (
    SELECT 1 FROM menu_items
    WHERE routes_to_all_stations = (preparation_station_id IS NOT NULL)
  ) OR EXISTS (
    SELECT 1 FROM item_library
    WHERE routes_to_all_stations = (preparation_station_id IS NOT NULL)
  ) OR EXISTS (
    SELECT 1 FROM order_line_items
    WHERE routes_to_all_stations = (preparation_station_name IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'preparation station routing invariant failed';
  END IF;
  IF EXISTS (
    SELECT 1 FROM order_line_items
    WHERE line_status NOT IN ('received', 'preparing', 'ready', 'served', 'cancelled')
  ) THEN
    RAISE EXCEPTION 'order line status backfill invariant failed';
  END IF;
  IF EXISTS (SELECT 1 FROM tabs WHERE status NOT IN ('open', 'settled_externally')) THEN
    RAISE EXCEPTION 'external settlement status migration failed';
  END IF;
  -- Migration 050. The 001 status check was inline, auto-named and never dropped,
  -- so 'no_show' -- which migration 030 and reservation_service both assume --
  -- was rejected on every migrated database. pytest cannot see this: it builds
  -- its schema from Base.metadata, not from the migration chain.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname = 'reservations'
      AND con.conname = 'ck_reservations_status'
      AND pg_get_constraintdef(con.oid) LIKE '%no_show%'
  ) THEN
    RAISE EXCEPTION 'reservations.status constraint does not admit no_show';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname = 'reservations'
      AND con.contype = 'c'
      AND con.conname <> 'ck_reservations_status'
      AND pg_get_constraintdef(con.oid) LIKE '%''completed''%'
  ) THEN
    RAISE EXCEPTION 'a second reservations status check survived migration 050';
  END IF;
  -- Stage 8 part one: the physical layer the pilot journey needs. Migrations 024
  -- and 039 backfill these only for businesses that already existed, so the seed
  -- has to insert its own and a silent regression would leave the floor empty.
  IF (SELECT COUNT(*) FROM locations l JOIN businesses b ON b.id = l.business_id
      WHERE b.slug = 'volt-and-vine' AND l.is_primary) <> 1 THEN
    RAISE EXCEPTION 'the demo tenant has no single primary location';
  END IF;
  IF (SELECT COUNT(*) FROM table_areas a JOIN businesses b ON b.id = a.business_id
      WHERE b.slug = 'volt-and-vine' AND a.deleted_at IS NULL) = 0
     OR (SELECT COUNT(*) FROM tables t JOIN businesses b ON b.id = t.business_id
         WHERE b.slug = 'volt-and-vine' AND t.deleted_at IS NULL) = 0 THEN
    RAISE EXCEPTION 'the demo tenant has no floor plan to seat anyone on';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM table_combinations c
    JOIN businesses b ON b.id = c.business_id
    JOIN table_combination_members m ON m.combination_id = c.id
    WHERE b.slug = 'volt-and-vine' AND c.is_active
    GROUP BY c.id HAVING COUNT(m.table_id) > 1
  ) THEN
    RAISE EXCEPTION 'no active table combination with members, so multi-table allocation is unreachable';
  END IF;
  IF (SELECT COUNT(*) FROM preparation_stations p JOIN businesses b ON b.id = p.business_id
      WHERE b.slug = 'volt-and-vine' AND p.is_active
        AND p.name IN ('Bar', 'Kitchen')) <> 2 THEN
    RAISE EXCEPTION 'the demo tenant is missing its bar or kitchen preparation station';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM tabs t JOIN businesses b ON b.id = t.business_id
    WHERE b.slug = 'volt-and-vine' AND t.status = 'open' AND t.seating_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'the demo tenant has no open tab on a seating';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM tabs t
    JOIN businesses b ON b.id = t.business_id
    JOIN tab_settlement_events e ON e.id = t.current_settlement_event_id
    WHERE b.slug = 'volt-and-vine' AND t.status = 'settled_externally'
      AND e.event_type = 'settled_externally'
  ) THEN
    RAISE EXCEPTION 'the demo tenant has no externally settled tab with its settlement event';
  END IF;
END $$;
SQL

echo "Fresh migration + repeat seed verification passed for $VERIFY_DB."
