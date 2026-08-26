"""The Model Policy in CONTEXT.md, asserted rather than merely written down.

Four rules, each of which is a way an ML dashboard can lie to an operator:

* **Minimum data** — a metric computed from nine rows renders identically to a
  real one, so below the floor there must be no metric at all.
* **Reproducibility** — the same data must produce the same segments, or a
  guest's label changes for no reason a manager can explain.
* **Leakage** — a feature that reads the outcome it predicts scores near
  perfectly and predicts nothing.
* **Determinism of the seed** — a fixed `random_state` is only a guarantee if
  every model actually carries one.
"""

import unittest

import numpy as np
import pandas as pd

from src.models.cancellation import (
    MIN_TRAINING_SAMPLES,
    TARGET_COLUMN as CANCELLATION_TARGET,
    CancellationPredictionModel,
)
from src.models.demand_forecast import MIN_HISTORY_DAYS, DemandForecastModel
from src.models.segmentation import MIN_CUSTOMERS, CustomerSegmentationModel


def _rfm(count: int) -> pd.DataFrame:
    rng = np.random.default_rng(7)
    return pd.DataFrame(
        {
            "customer_id": [f"cust-{i}" for i in range(count)],
            "recency": rng.integers(1, 120, count),
            "frequency": rng.integers(1, 20, count),
            "engagement": rng.random(count),
        }
    )


class MinimumDataTests(unittest.TestCase):
    def test_segmentation_below_the_floor_produces_no_segments(self):
        model = CustomerSegmentationModel()
        result = model.fit_predict(_rfm(MIN_CUSTOMERS - 1))

        self.assertTrue(result.empty, "segments were produced below the floor")
        self.assertIsNotNone(model.insufficient_reason)
        self.assertIn(str(MIN_CUSTOMERS), model.insufficient_reason)

    def test_segmentation_at_the_floor_produces_segments(self):
        """The floor has to be reachable, or it is just an off switch."""
        model = CustomerSegmentationModel()
        result = model.fit_predict(_rfm(MIN_CUSTOMERS))

        self.assertEqual(len(result), MIN_CUSTOMERS)
        self.assertIsNone(model.insufficient_reason)
        self.assertIn("segment_label", result.columns)

    def test_cancellation_below_the_floor_trains_nothing(self):
        model = CancellationPredictionModel()
        frame = self._cancellation_frame(MIN_TRAINING_SAMPLES - 1)

        result = model.train_and_evaluate(frame)

        self.assertEqual(result.status, "insufficient_data")
        self.assertIsNotNone(result.insufficient_reason)
        # No metric at all, rather than a metric that looks real.
        self.assertEqual(result.metrics.support, 0)
        self.assertEqual(result.metrics.auc_roc, 0.0)

    def test_cancellation_refuses_a_single_outcome_dataset(self):
        """A venue where nothing was ever cancelled has nothing to learn from.

        Training here yields a model that predicts "never" with a perfect score,
        which would be shown to a manager as a reliable prediction.
        """
        model = CancellationPredictionModel()
        frame = self._cancellation_frame(MIN_TRAINING_SAMPLES + 20)
        frame[CANCELLATION_TARGET] = 0

        result = model.train_and_evaluate(frame)

        self.assertEqual(result.status, "insufficient_data")
        self.assertIn("same outcome", result.insufficient_reason)

    def test_demand_below_the_floor_forecasts_nothing_and_says_why(self):
        model = DemandForecastModel()
        result = model.train_and_evaluate(self._demand_frame(MIN_HISTORY_DAYS - 3))

        self.assertTrue(result.forecasts.empty)
        self.assertEqual(len(result.insufficient_reasons), 1)
        reason = next(iter(result.insufficient_reasons.values()))
        self.assertIn(str(MIN_HISTORY_DAYS), reason)

    @staticmethod
    def _cancellation_frame(rows: int) -> pd.DataFrame:
        rng = np.random.default_rng(11)
        model = CancellationPredictionModel()
        frame = pd.DataFrame(
            {column: rng.random(rows) for column in model.feature_columns}
        )
        # Alternating outcomes so both classes are present.
        frame[CANCELLATION_TARGET] = [i % 2 for i in range(rows)]
        return frame

    @staticmethod
    def _demand_frame(days: int) -> pd.DataFrame:
        model = DemandForecastModel()
        rng = np.random.default_rng(13)
        frame = pd.DataFrame(
            {
                "business_id": ["biz-1"] * days,
                "date": pd.date_range("2026-01-01", periods=days, freq="D"),
                "reservation_count": rng.integers(5, 40, days),
            }
        )
        for column in model.feature_columns:
            if column not in frame.columns:
                frame[column] = rng.random(days)
        return frame


class ReproducibilityTests(unittest.TestCase):
    def test_segmentation_is_reproducible_over_unchanged_data(self):
        """Same data in, same segments out.

        A guest whose label flips between two runs over identical history makes
        the whole surface unarguable — a manager cannot act on a label that
        moves on its own.
        """
        frame = _rfm(60)
        first = CustomerSegmentationModel().fit_predict(frame.copy())
        second = CustomerSegmentationModel().fit_predict(frame.copy())

        pd.testing.assert_series_equal(
            first["cluster"].reset_index(drop=True),
            second["cluster"].reset_index(drop=True),
        )
        pd.testing.assert_series_equal(
            first["segment_label"].reset_index(drop=True),
            second["segment_label"].reset_index(drop=True),
        )

    def test_every_model_carries_a_fixed_seed(self):
        """A documented seed that a model does not take is not a guarantee."""
        self.assertEqual(CustomerSegmentationModel().random_state, 42)
        self.assertEqual(CancellationPredictionModel().random_state, 42)
        self.assertEqual(DemandForecastModel().random_state, 42)


class LeakageTests(unittest.TestCase):
    """No feature may read a column written by the outcome it predicts."""

    #: Columns set at or after the moment the outcome is decided. A model that
    #: sees any of these is reading the answer, not predicting it.
    OUTCOME_COLUMNS = {
        "status",
        "cancelled_at",
        "cancelled_by",
        "cancelled_late",
        "no_show_at",
        "no_show_by",
        "no_show_note",
        "is_cancelled",
        "completed_at",
    }

    def test_cancellation_features_exclude_every_outcome_column(self):
        features = set(CancellationPredictionModel().feature_columns)
        leaked = features & self.OUTCOME_COLUMNS
        self.assertEqual(
            leaked,
            set(),
            f"cancellation features read the outcome they predict: {sorted(leaked)}",
        )

    def test_the_target_is_not_also_a_feature(self):
        model = CancellationPredictionModel()
        self.assertNotIn(CANCELLATION_TARGET, model.feature_columns)

    def test_demand_features_use_only_backward_looking_lags(self):
        """A forecast may not read the day it is forecasting.

        Every demand feature is a lag, a rolling window, or a calendar attribute
        of the target day — none of which requires knowing the count.
        """
        features = DemandForecastModel().feature_columns
        for feature in features:
            self.assertFalse(
                feature == "reservation_count",
                "the demand model used the value it forecasts as a feature",
            )
            self.assertTrue(
                any(
                    marker in feature
                    for marker in ("lag", "roll", "avg", "mean", "day", "month", "week", "is_")
                ),
                f"{feature} is neither a lag, a rolling window, nor a calendar "
                "attribute — check whether it can be known before the day starts",
            )


if __name__ == "__main__":
    unittest.main()
