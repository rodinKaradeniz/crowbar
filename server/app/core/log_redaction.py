import logging
import re


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


class SensitiveDataFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.msg = redact_log_text(record.getMessage())
        record.args = ()
        return True


def install_log_redaction() -> None:
    root = logging.getLogger()
    for handler in root.handlers:
        handler.addFilter(SensitiveDataFilter())
