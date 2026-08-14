#!/usr/bin/env bash

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERIFY_DB="${CROWBAR_VERIFY_DB:-crowbar_verify_mvp}"

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
  venv/bin/python -m db.migrate

# The canonical seed is replacement-based and must be safe to repeat.
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/$VERIFY_DB" \
  venv/bin/python -m db.migrate seed

EXPECTED_MIGRATIONS="$(find db/migrations -maxdepth 1 -name '*.sql' | wc -l | tr -d ' ')"
docker exec crowbar-db psql -v ON_ERROR_STOP=1 -v expected="$EXPECTED_MIGRATIONS" \
  -U postgres -d "$VERIFY_DB" <<'SQL'
DO $$
BEGIN
  IF (SELECT COUNT(*) FROM _migrations) <> :'expected'::integer THEN
    RAISE EXCEPTION 'migration count mismatch';
  END IF;
  IF (SELECT COUNT(*) FROM businesses WHERE slug = 'puzzles') <> 1 THEN
    RAISE EXCEPTION 'canonical Puzzles tenant missing or duplicated';
  END IF;
  IF (SELECT COUNT(*) FROM staff s JOIN businesses b ON b.id = s.business_id
      WHERE b.slug = 'puzzles' AND s.role IN ('owner', 'manager', 'staff')) <> 3 THEN
    RAISE EXCEPTION 'canonical staff-role seed is invalid';
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
  ) THEN
    RAISE EXCEPTION 'order authority backfill invariant failed';
  END IF;
  IF to_regclass('public.inventory_discrepancies') IS NULL
     OR to_regclass('public.reservation_delivery_attempts') IS NULL
     OR to_regclass('public.password_reset_tokens') IS NULL THEN
    RAISE EXCEPTION 'stage-1 integrity tables are missing';
  END IF;
END $$;
SQL

echo "Fresh migration + repeat seed verification passed for $VERIFY_DB."
