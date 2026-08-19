from app.services.queue_service import calculate_wait_estimate


def test_wait_estimate_requires_five_samples_and_rounds_median_to_five_minutes():
    assert calculate_wait_estimate([10, 20, 30, 40]) is None
    assert calculate_wait_estimate([8, 12, 16, 21, 44]) == 15
    assert calculate_wait_estimate([1, 1, 2, 2, 2]) == 5


def test_wait_estimate_uses_the_median_instead_of_outliers():
    assert calculate_wait_estimate([10, 11, 12, 13, 120]) == 10
