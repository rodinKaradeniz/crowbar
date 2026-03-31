"""
Google Calendar sync for reservations.

Creates/updates/deletes Google Calendar events when reservations change status.
Wraps all API calls in try/except and returns None/False gracefully if the
business hasn't connected Google or if the API call fails.
"""

import asyncio
import logging
import uuid
from datetime import datetime, timedelta
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.services import google_oauth_service

logger = logging.getLogger(__name__)


def _build_service(credentials):
    """Build a Google Calendar API service (sync, runs in executor)."""
    from googleapiclient.discovery import build
    return build("calendar", "v3", credentials=credentials)


async def _run_in_executor(fn, *args):
    """Run a synchronous function in a thread pool executor."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, fn, *args)


def _create_event_sync(credentials, summary: str, description: str,
                        start: datetime, end: datetime,
                        attendee_email: str | None, request_id: str) -> dict | None:
    """Synchronous helper — runs in executor."""
    try:
        service = _build_service(credentials)
        body = {
            "summary": summary,
            "description": description,
            "start": {"dateTime": start.isoformat(), "timeZone": "UTC"},
            "end": {"dateTime": end.isoformat(), "timeZone": "UTC"},
        }
        if attendee_email:
            body["attendees"] = [{"email": attendee_email}]
        return (
            service.events()
            .insert(calendarId="primary", body=body, sendUpdates="none")
            .execute()
        )
    except Exception as e:
        logger.warning("Google Calendar create_event failed: %s", e)
        return None


def _update_event_sync(credentials, event_id: str, summary: str,
                        description: str, start: datetime, end: datetime) -> bool:
    """Synchronous helper — runs in executor."""
    try:
        service = _build_service(credentials)
        body = {
            "summary": summary,
            "description": description,
            "start": {"dateTime": start.isoformat(), "timeZone": "UTC"},
            "end": {"dateTime": end.isoformat(), "timeZone": "UTC"},
        }
        service.events().patch(
            calendarId="primary", eventId=event_id, body=body, sendUpdates="none"
        ).execute()
        return True
    except Exception as e:
        logger.warning("Google Calendar update_event failed: %s", e)
        return False


def _delete_event_sync(credentials, event_id: str) -> bool:
    """Synchronous helper — runs in executor."""
    try:
        service = _build_service(credentials)
        service.events().delete(calendarId="primary", eventId=event_id).execute()
        return True
    except Exception as e:
        logger.warning("Google Calendar delete_event failed: %s", e)
        return False


async def create_calendar_event(
    db: AsyncSession,
    business_id: UUID,
    *,
    reservation_id: str,
    summary: str,
    description: str = "",
    start: datetime,
    end: datetime,
    attendee_email: str | None = None,
) -> str | None:
    """
    Create a Google Calendar event for a reservation.
    Returns the event ID (to store on the reservation), or None on failure.
    """
    credentials = await google_oauth_service.get_credentials_for_business(db, business_id)
    if credentials is None:
        return None

    result = await _run_in_executor(
        _create_event_sync,
        credentials, summary, description, start, end, attendee_email, reservation_id,
    )
    if result is None:
        return None

    event_id = result.get("id")
    logger.info("Created Google Calendar event %s for reservation %s", event_id, reservation_id)
    return event_id


async def update_calendar_event(
    db: AsyncSession,
    business_id: UUID,
    event_id: str,
    *,
    summary: str,
    description: str = "",
    start: datetime,
    end: datetime,
) -> bool:
    """Update an existing Google Calendar event. Returns True on success."""
    credentials = await google_oauth_service.get_credentials_for_business(db, business_id)
    if credentials is None:
        return False

    return await _run_in_executor(
        _update_event_sync, credentials, event_id, summary, description, start, end
    )


async def delete_calendar_event(
    db: AsyncSession,
    business_id: UUID,
    event_id: str,
) -> bool:
    """Delete a Google Calendar event. Returns True on success."""
    credentials = await google_oauth_service.get_credentials_for_business(db, business_id)
    if credentials is None:
        return False

    return await _run_in_executor(_delete_event_sync, credentials, event_id)
