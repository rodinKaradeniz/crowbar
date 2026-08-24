from urllib.parse import urlparse

from app.config import settings
from app.models.business import Business


def has_required_privacy_contact(business: Business) -> bool:
    """Production public flows require a venue contact and HTTPS policy URL."""
    if settings.environment != "production":
        return True
    contact = (business.privacy_contact or "").strip()
    policy_url = (business.privacy_policy_url or "").strip()
    parsed = urlparse(policy_url)
    return bool(contact and parsed.scheme == "https" and parsed.netloc)
