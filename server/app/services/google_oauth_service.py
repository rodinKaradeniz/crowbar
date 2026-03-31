"""Google OAuth token storage and refresh for Calendar API / Meet links."""

import asyncio
import logging
from datetime import datetime, timedelta
from uuid import UUID

logger = logging.getLogger(__name__)

from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from google.auth.transport.requests import Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.google_oauth_token import GoogleOAuthToken


def get_authorization_url(business_id: UUID, redirect_uri: str | None = None) -> str:
    """
    Generate the Google OAuth authorization URL for a business to connect their account.
    """
    if not settings.google_client_id or not settings.google_client_secret:
        raise ValueError("Google OAuth not configured")

    redirect = redirect_uri or settings.google_redirect_uri
    flow = Flow.from_client_config(
        {
            "web": {
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "redirect_uris": [redirect],
            }
        },
        scopes=[
            "https://www.googleapis.com/auth/calendar",
            "https://www.googleapis.com/auth/calendar.events",
        ],
        redirect_uri=redirect,
    )
    auth_url, _ = flow.authorization_url(
        access_type="offline",
        prompt="consent",
        include_granted_scopes="true",
        state=str(business_id),
    )
    return auth_url


async def exchange_code_and_store(
    db: AsyncSession, code: str, state: str
) -> GoogleOAuthToken | None:
    """
    Exchange authorization code for tokens and store them for the business.
    state should be the business_id.
    """
    if not settings.google_client_id or not settings.google_client_secret:
        return None

    flow = Flow.from_client_config(
        {
            "web": {
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "redirect_uris": [settings.google_redirect_uri],
            }
        },
        scopes=[
            "https://www.googleapis.com/auth/calendar",
            "https://www.googleapis.com/auth/calendar.events",
        ],
        redirect_uri=settings.google_redirect_uri,
    )
    try:
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, lambda: flow.fetch_token(code=code))
    except Exception as exc:
        logger.error("Google OAuth token exchange failed: %s", exc)
        return None

    credentials = flow.credentials
    try:
        business_id = UUID(state)
    except ValueError:
        logger.error("Invalid business_id in OAuth state: %s", state)
        return None

    # Upsert: update if exists, insert if not
    result = await db.execute(
        select(GoogleOAuthToken).where(GoogleOAuthToken.business_id == business_id)
    )
    existing = result.scalar_one_or_none()

    if existing:
        existing.access_token = credentials.token
        existing.refresh_token = credentials.refresh_token or existing.refresh_token
        existing.expires_at = credentials.expiry or existing.expires_at
        await db.flush()
        return existing

    token = GoogleOAuthToken(
        business_id=business_id,
        access_token=credentials.token,
        refresh_token=credentials.refresh_token,
        expires_at=credentials.expiry or (datetime.utcnow() + timedelta(hours=1)),
    )
    db.add(token)
    await db.flush()
    return token


async def get_credentials_for_business(
    db: AsyncSession, business_id: UUID
) -> Credentials | None:
    """
    Get valid Google credentials for a business, refreshing if needed.
    Returns None if the business has not connected Google.
    """
    result = await db.execute(
        select(GoogleOAuthToken).where(GoogleOAuthToken.business_id == business_id)
    )
    row = result.scalar_one_or_none()
    if row is None:
        return None

    credentials = Credentials(
        token=row.access_token,
        refresh_token=row.refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=settings.google_client_id,
        client_secret=settings.google_client_secret,
        scopes=[
            "https://www.googleapis.com/auth/calendar",
            "https://www.googleapis.com/auth/calendar.events",
        ],
    )

    if credentials.expired and credentials.refresh_token:
        credentials.refresh(Request())
        row.access_token = credentials.token
        if credentials.expiry:
            row.expires_at = credentials.expiry
        await db.flush()

    return credentials
