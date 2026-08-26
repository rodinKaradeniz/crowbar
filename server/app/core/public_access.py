from urllib.parse import urlparse

from app.config import settings
from app.models.business import Business


def has_privacy_contact(business: Business) -> bool:
    """Whether this venue has published a usable privacy contact.

    Deliberately environment-independent: this is a fact about the venue's
    configuration, not about where the code is running. The old version returned
    `True` unconditionally outside production, which meant no test could ever
    observe it failing and the rule went unverified until deployment.

    A policy URL must be HTTPS with a host. An `http://` link on a page that
    collects a guest's name and phone number is not a privacy policy anyone
    should be sent to.
    """
    contact = (business.privacy_contact or "").strip()
    policy_url = (business.privacy_policy_url or "").strip()
    parsed = urlparse(policy_url)
    return bool(contact and parsed.scheme == "https" and parsed.netloc)


def has_required_privacy_contact(business: Business) -> bool:
    """Whether a public surface may be served for this venue.

    Production requires the contact; development and test do not, so a local
    venue can be exercised before it is configured. The relaxation lives here
    rather than inside `has_privacy_contact` so the underlying rule stays
    testable, and so a reader can see exactly what is being waived and where.
    """
    if settings.environment != "production":
        return True
    return has_privacy_contact(business)
