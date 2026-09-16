import hashlib
import hmac
import logging
import re

from app.config import settings


_PATTERNS = (
    (re.compile(r"(?i)\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b"), "[redacted-email]"),
    (re.compile(r"(?<![\w-])\+\d{7,15}\b"), "[redacted-phone]"),
    (re.compile(r"(?i)\b(?:postgres(?:ql)?|redis)://\S+"), "[redacted-dsn]"),
    (re.compile(r"\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b"), "[redacted-token]"),
    (
        re.compile(
            r"(?i)\b(authorization|cookie|set-cookie|token|secret|password|dsn|provider_(?:id|error))\s*[=:]\s*[^\s,;]+"
        ),
        r"\1=[redacted]",
    ),
)


def redact_log_text(value: str) -> str:
    for pattern, replacement in _PATTERNS:
        value = pattern.sub(replacement, value)
    return value


def destination_reference(value: str) -> str:
    """A stable, non-reversible handle for a recipient address or phone number.

    Two log lines about the same recipient can be correlated without either of
    them naming a person. Keyed, so the reference cannot be recomputed from a
    guessed address by anyone without the secret, and truncated because 48 bits
    is plenty to correlate a handful of sends and short enough to read.

    This exists because `SensitiveDataFilter` below is a safety net, not a
    licence: it rewrites `record.msg` and nothing else, so a value that reaches
    a log through a traceback is never scrubbed. Do not log the address and
    rely on the filter to catch it.
    """
    return hmac.new(
        settings.rate_limit_hmac_secret.encode("utf-8"),
        value.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()[:12]


class SensitiveDataFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.msg = redact_log_text(record.getMessage())
        record.args = ()
        return True


def install_log_redaction() -> None:
    root = logging.getLogger()
    for handler in root.handlers:
        handler.addFilter(SensitiveDataFilter())
