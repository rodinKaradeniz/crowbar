"""Canonical day-of-week enumeration, shared across the whole backend.

Index convention: **0 = Monday … 6 = Sunday**. This matches Python's
``datetime.weekday()`` exactly, so any code can compare a stored day index
against ``dt.weekday()`` with no offset.

This is the single source of truth for day ordering on the backend. The frontend
mirror lives in ``client/lib/days.ts`` and uses the identical indices. Any column
that stores a day-of-week value (e.g. ``menu_activation_windows.days_of_week``) uses
these indices.

Note: JavaScript's ``Date.getDay()`` uses 0 = Sunday; the frontend converts it to
this convention before storing. Never mix the two conventions.
"""

from datetime import datetime

# Ordered Monday-first. Index == datetime.weekday().
DAY_NAMES: list[str] = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
]

# Short abbreviations, same Monday-first ordering.
DAY_ABBREVIATIONS: list[str] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

# Valid day indices (0..6).
DAY_INDICES: range = range(7)


def weekday_index(dt: datetime) -> int:
    """Return the day-of-week index for a datetime (0=Monday..6=Sunday)."""
    return dt.weekday()
