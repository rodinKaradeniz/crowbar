import unittest
from uuid import uuid4
from unittest.mock import patch

import pandas as pd
from fastapi import HTTPException

from src import db
from src.config import settings
from src.main import _get_latest_results, _latest_results, require_internal_token


class TenantIsolationTests(unittest.TestCase):
    def test_reservation_loader_requires_business_filter(self):
        captured: dict = {}

        def fake_load_dataframe(query: str, params: dict | None = None):
            captured["query"] = query
            captured["params"] = params
            return pd.DataFrame()

        business_id = str(uuid4())
        with patch.object(db, "load_dataframe", fake_load_dataframe):
            db.load_reservations(business_id)

        self.assertIn(
            "WHERE r.business_id = :business_id",
            captured["query"],
        )
        self.assertEqual(captured["params"], {"business_id": business_id})

    def test_customer_loader_requires_business_filter(self):
        captured: dict = {}

        def fake_load_dataframe(query: str, params: dict | None = None):
            captured["query"] = query
            captured["params"] = params
            return pd.DataFrame()

        business_id = str(uuid4())
        with patch.object(db, "load_dataframe", fake_load_dataframe):
            db.load_customers(business_id)

        self.assertIn("r.business_id = :business_id", captured["query"])
        self.assertEqual(captured["params"], {"business_id": business_id})

    def test_latest_results_are_isolated_by_business(self):
        first_business = uuid4()
        second_business = uuid4()
        _latest_results.clear()
        _latest_results[str(first_business)] = {"run_id": "tenant-a"}

        self.assertEqual(
            _get_latest_results(first_business)["run_id"],
            "tenant-a",
        )
        with self.assertRaises(HTTPException) as context:
            _get_latest_results(second_business)
        self.assertEqual(context.exception.status_code, 404)

    def test_internal_routes_require_matching_service_token(self):
        with (
            patch.object(settings, "environment", "production"),
            patch.object(settings, "ml_internal_token", "expected-token"),
        ):
            require_internal_token("expected-token")

            with self.assertRaises(HTTPException) as context:
                require_internal_token("wrong-token")
            self.assertEqual(context.exception.status_code, 401)


if __name__ == "__main__":
    unittest.main()
