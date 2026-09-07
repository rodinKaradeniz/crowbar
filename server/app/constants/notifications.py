"""Notification kind strings (staff recipients only)."""

RESERVATION_CREATED = "reservation_created"
RESERVATION_UPDATED = "reservation_updated"
RESERVATION_CANCELLED = "reservation_cancelled"

#: A guest exercised a data right through their own reservation link. Access,
#: correction and deletion are recorded `pending` for a human, so without this
#: the venue has no way to learn one was raised.
CUSTOMER_DATA_REQUEST = "customer_data_request"
