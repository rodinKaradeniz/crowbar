import asyncio
import glob
import os
import sys
from urllib.parse import urlparse

import asyncpg
import bcrypt
from dotenv import load_dotenv

# Load .env so DATABASE_URL is available when running standalone
load_dotenv()


async def get_connection() -> asyncpg.Connection:
    database_url = os.getenv(
        "DATABASE_URL",
        "postgresql://postgres:postgres@localhost:5432/crowbar",
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
    database_url = os.getenv(
        "DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/crowbar"
    ).replace("postgresql+asyncpg://", "postgresql://")
    parsed = urlparse(database_url)
    local_hosts = {"localhost", "127.0.0.1", "::1", "db", "crowbar-db"}
    if parsed.hostname not in local_hosts:
        raise RuntimeError("Demo seeding is limited to local disposable databases")

    # The demo tenant is a local-only showcase, so its password is deliberately
    # a known weak one: the local-host guard above is what keeps seeding away
    # from any real database. Override with DEMO_ADMIN_PASSWORD if needed. The
    # plaintext never reaches a seed file - only this hash is substituted in -
    # which is what keeps it out of the portfolio export.
    demo_password = os.getenv("DEMO_ADMIN_PASSWORD") or "password123"
    password_hash = bcrypt.hashpw(
        demo_password.encode("utf-8"), bcrypt.gensalt()
    ).decode("utf-8")

    seeds_dir = os.path.join(os.path.dirname(__file__), "seeds")
    files = sorted(glob.glob(os.path.join(seeds_dir, "*.sql")))

    if not files:
        print("No seed files found.")
        return

    for filepath in files:
        filename = os.path.basename(filepath)
        source_sql = open(filepath).read()
        if "__DEMO_PASSWORD_HASH__" not in source_sql:
            raise RuntimeError(f"Seed password placeholder is missing in {filename}")
        sql = source_sql.replace("__DEMO_PASSWORD_HASH__", password_hash)
        await conn.execute(sql)
        print(f"🌱 Seed: {filename}")

    print(f"🔑 Demo staff sign in with: {demo_password}")


async def main() -> None:
    command = sys.argv[1] if len(sys.argv) > 1 else "migrate"
    seed = os.getenv("SEED_DATA", "false").lower() == "true"

    conn = await get_connection()

    try:
        if command == "seed":
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
            print("Usage: python -m db.migrate [migrate|seed]")
            print("  Set SEED_DATA=true and DEMO_ADMIN_PASSWORD to seed after migrate")
            sys.exit(1)

    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
