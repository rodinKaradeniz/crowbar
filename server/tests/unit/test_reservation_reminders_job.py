from datetime import datetime

import pytest

from app.jobs.reservation_reminders import run_reservation_reminders


@pytest.mark.asyncio
async def test_rejects_naive_run_time_before_opening_database():
    with pytest.raises(ValueError, match="timezone-aware"):
        await run_reservation_reminders(now=datetime(2026, 7, 24, 12, 0))
