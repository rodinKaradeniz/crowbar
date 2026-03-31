"""Create Google Calendar events with Meet links for online reservations."""

import uuid
from datetime import datetime, timedelta
from uuid import UUID

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from sqlalchemy.ext.asyncio import AsyncSession

from app.services import google_oauth_service


async def create_meet_link(
    db: AsyncSession,
    business_id: UUID,
    *,
    summary: str,
    start: datetime,
    end: datetime,
    attendee_email: str,
    description: str = "",
) -> str | None:
    """
    Create a Google Calendar event with a Meet link for an online reservation.
    Returns the Meet link URL, or None if creation failed.
    """
    credentials = await google_oauth_service.get_credentials_for_business(
        db, business_id
    )
    if credentials is None:
        return None

    service = build("calendar", "v3", credentials=credentials)

    event = {
        "summary": summary,
        "description": description,
        "start": {
            "dateTime": start.isoformat(),
            "timeZone": "UTC",
        },
        "end": {
            "dateTime": end.isoformat(),
            "timeZone": "UTC",
        },
        "attendees": [{"email": attendee_email}],
        "conferenceData": {
            "createRequest": {
                "requestId": uuid.uuid4().hex,
                "conferenceSolutionKey": {"type": "hangoutsMeet"},
            }
        },
    }

    try:
        created = (
            service.events()
            .insert(
                calendarId="primary",
                body=event,
                conferenceDataVersion=1,
                sendUpdates="none",
            )
            .execute()
        )
        entry_points = created.get("conferenceData", {}).get("entryPoints", [])
        for ep in entry_points:
            if ep.get("entryPointType") == "video":
                return ep.get("uri")
        return None
    except Exception:
        return None
