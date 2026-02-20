"""
Utility functions for model evaluation and metrics formatting.
"""

import numpy as np


def format_metrics(metrics: dict) -> str:
    """Format a metrics dictionary into a readable string."""
    lines = []
    for key, value in metrics.items():
        if isinstance(value, float):
            lines.append(f"  {key}: {value:.4f}")
        else:
            lines.append(f"  {key}: {value}")
    return "\n".join(lines)


def safe_divide(numerator: float, denominator: float, default: float = 0.0) -> float:
    """Safe division that returns a default value when dividing by zero."""
    if denominator == 0:
        return default
    return numerator / denominator


def calculate_mape(actual: np.ndarray, predicted: np.ndarray) -> float:
    """Calculate Mean Absolute Percentage Error, handling zeros."""
    mask = actual != 0
    if not mask.any():
        return 0.0
    return np.mean(np.abs((actual[mask] - predicted[mask]) / actual[mask])) * 100
