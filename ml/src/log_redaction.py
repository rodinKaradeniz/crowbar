import logging
import re


_PATTERNS = (
    (re.compile(r"(?i)\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b"), "[redacted-email]"),
    (re.compile(r"(?<![\w-])\+\d{7,15}\b"), "[redacted-phone]"),
    (re.compile(r"(?i)\b(?:postgres(?:ql)?|redis)://\S+"), "[redacted-dsn]"),
    (
        re.compile(r"(?i)\b(authorization|cookie|token|secret|password|dsn|provider_(?:id|error))\s*[=:]\s*[^\s,;]+"),
        r"\1=[redacted]",
    ),
)


class SensitiveDataFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        message = record.getMessage()
        for pattern, replacement in _PATTERNS:
            message = pattern.sub(replacement, message)
        record.msg = message
        record.args = ()
        return True


def install_log_redaction() -> None:
    for handler in logging.getLogger().handlers:
        handler.addFilter(SensitiveDataFilter())
