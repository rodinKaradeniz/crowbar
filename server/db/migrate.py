import asyncio
import glob
import os
import sys

import asyncpg
from dotenv import load_dotenv

# Load .env so DATABASE_URL is available when running standalone
load_dotenv()


async def get_connection() -> asyncpg.Connection:
    database_url = os.getenv(
        "DATABASE_URL",
        "postgresql://postgres:postgres@localhost:5432/slotera",
    )
    # asyncpg uses postgresql:// not postgresql+asyncpg://
    database_url = database_url.replace("postgresql+asyncpg://", "postgresql://")
    return await asyncpg.connect(database_url)


async def _migrations_table_exists(conn: asyncpg.Connection) -> bool:
    return await conn.fetchval(
        """
        SELECT EXISTS(
            SELECT 1 FROM information_schema.tables
            WHERE table_name = '_migrations'
        )
        """
    )


async def run_migrations(conn: asyncpg.Connection) -> None:
    migrations_dir = os.path.join(os.path.dirname(__file__), "migrations")
    files = sorted(glob.glob(os.path.join(migrations_dir, "*.sql")))

    if not files:
        print("No migration files found.")
        return

    for filepath in files:
        filename = os.path.basename(filepath)

        # Check if migration was already applied (only if tracking table exists)
        if await _migrations_table_exists(conn):
            already_applied = await conn.fetchval(
                """
                SELECT EXISTS(
                    SELECT 1 FROM _migrations WHERE filename = $1
                )
                """,
                filename,
            )

            if already_applied:
                print(f"⏭️  Skipping (already applied): {filename}")
                continue

        sql = open(filepath).read()
        await conn.execute(sql)

        # Record the migration
        await conn.execute(
            "INSERT INTO _migrations (filename) VALUES ($1)", filename
        )

        print(f"✅ Migration: {filename}")


async def run_seeds(conn: asyncpg.Connection) -> None:
    seeds_dir = os.path.join(os.path.dirname(__file__), "seeds")
    files = sorted(glob.glob(os.path.join(seeds_dir, "*.sql")))

    if not files:
        print("No seed files found.")
        return

    for filepath in files:
        filename = os.path.basename(filepath)
        sql = open(filepath).read()
        await conn.execute(sql)
        print(f"🌱 Seed: {filename}")


async def reset_database(conn: asyncpg.Connection) -> None:
    print("⚠️  Dropping all tables...")
    await conn.execute(
        """
        DROP TABLE IF EXISTS reservations CASCADE;
        DROP TABLE IF EXISTS service_types CASCADE;
        DROP TABLE IF EXISTS staff CASCADE;
        DROP TABLE IF EXISTS google_oauth_tokens CASCADE;
        DROP TABLE IF EXISTS ml_predictions CASCADE;
        DROP TABLE IF EXISTS business_daily_metrics CASCADE;
        DROP TABLE IF EXISTS users CASCADE;
        DROP TABLE IF EXISTS businesses CASCADE;
        DROP TABLE IF EXISTS _migrations CASCADE;
        DROP FUNCTION IF EXISTS update_updated_at_column CASCADE;
        """
    )
    print("✅ All tables dropped.")


async def main() -> None:
    command = sys.argv[1] if len(sys.argv) > 1 else "migrate"
    seed = os.getenv("SEED_DATA", "false").lower() == "true"

    conn = await get_connection()

    try:
        if command == "reset":
            await reset_database(conn)
            await run_migrations(conn)
            if seed:
                await run_seeds(conn)
                print("\n🌱 Test data seeded!")
            print("\n✅ Database reset complete.")

        elif command == "seed":
            await run_seeds(conn)
            print("\n🌱 Seeding complete.")

        elif command == "migrate":
            await run_migrations(conn)
            if seed:
                await run_seeds(conn)
                print("\n🌱 Test data seeded!")
            print("\n✅ Migrations complete.")

        else:
            print(f"Unknown command: {command}")
            print("Usage: python db/migrate.py [migrate|seed|reset]")
            print("  Set SEED_DATA=true to include test data with migrate/reset")
            sys.exit(1)

    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
