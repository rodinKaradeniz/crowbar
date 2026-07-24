import unittest

from src.config import Settings


class DatabaseUrlConfigTests(unittest.TestCase):
    def test_normalizes_provider_urls_for_each_driver(self):
        settings = Settings(
            database_url="postgres://user:pass@postgres:5432/crowbar",
            database_url_sync="postgres://user:pass@postgres:5432/crowbar",
        )

        self.assertEqual(
            settings.database_url,
            "postgresql+asyncpg://user:pass@postgres:5432/crowbar",
        )
        self.assertEqual(
            settings.database_url_sync,
            "postgresql://user:pass@postgres:5432/crowbar",
        )

    def test_preserves_explicit_driver_urls(self):
        settings = Settings(
            database_url="postgresql+asyncpg://u:p@postgres:5432/crowbar",
            database_url_sync="postgresql://u:p@postgres:5432/crowbar",
        )

        self.assertEqual(
            settings.database_url,
            "postgresql+asyncpg://u:p@postgres:5432/crowbar",
        )
        self.assertEqual(
            settings.database_url_sync,
            "postgresql://u:p@postgres:5432/crowbar",
        )


if __name__ == "__main__":
    unittest.main()
