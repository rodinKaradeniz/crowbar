"""
Standardized error format for all API responses.

Every error returns:  { "code": str, "message": str, "details": any | null }
"""
from fastapi import HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


# ─── Error codes ─────────────────────────────────────────────────────────────

class ErrorCode:
    # Auth
    UNAUTHORIZED = "UNAUTHORIZED"
    FORBIDDEN = "FORBIDDEN"
    INVALID_TOKEN = "INVALID_TOKEN"
    # Resources
    NOT_FOUND = "NOT_FOUND"
    CONFLICT = "CONFLICT"
    BOOKING_UNAVAILABLE = "BOOKING_UNAVAILABLE"
    SLOT_UNAVAILABLE = "SLOT_UNAVAILABLE"
    RESERVATION_NOT_RESCHEDULABLE = "RESERVATION_NOT_RESCHEDULABLE"
    # Modules
    MODULE_DISABLED = "MODULE_DISABLED"
    # Input
    VALIDATION_ERROR = "VALIDATION_ERROR"
    PARTY_SIZE_EXCEEDED = "PARTY_SIZE_EXCEEDED"
    RATE_LIMITED = "RATE_LIMITED"
    # Generic
    INTERNAL_ERROR = "INTERNAL_ERROR"
    BAD_REQUEST = "BAD_REQUEST"


_STATUS_TO_CODE: dict[int, str] = {
    400: ErrorCode.BAD_REQUEST,
    401: ErrorCode.UNAUTHORIZED,
    403: ErrorCode.FORBIDDEN,
    404: ErrorCode.NOT_FOUND,
    409: ErrorCode.CONFLICT,
    422: ErrorCode.VALIDATION_ERROR,
    429: ErrorCode.RATE_LIMITED,
    500: ErrorCode.INTERNAL_ERROR,
}


def _code_for_status(status_code: int) -> str:
    return _STATUS_TO_CODE.get(status_code, "ERROR")


# ─── Helpers ──────────────────────────────────────────────────────────────────

def api_error(
    status_code: int,
    code: str,
    message: str,
    details=None,
    headers: dict[str, str] | None = None,
) -> HTTPException:
    """Build an HTTPException whose detail is already in our standard shape."""
    return HTTPException(
        status_code=status_code,
        detail={"code": code, "message": message, "details": details},
        headers=headers,
    )


def not_found(resource: str = "Resource") -> HTTPException:
    return api_error(status.HTTP_404_NOT_FOUND, ErrorCode.NOT_FOUND, f"{resource} not found")


def forbidden(message: str = "Access denied") -> HTTPException:
    return api_error(status.HTTP_403_FORBIDDEN, ErrorCode.FORBIDDEN, message)


def module_disabled(module: str) -> HTTPException:
    return api_error(
        status.HTTP_403_FORBIDDEN,
        ErrorCode.MODULE_DISABLED,
        f"Module '{module}' is not enabled for this business",
        {"module": module},
    )


# ─── Exception handlers ───────────────────────────────────────────────────────

async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    """Normalize all HTTPExceptions to { code, message, details }."""
    detail = exc.detail
    if isinstance(detail, dict) and "code" in detail:
        # Already in our format
        body = {
            "code": detail.get("code", _code_for_status(exc.status_code)),
            "message": detail.get("message", "An error occurred"),
            "details": detail.get("details"),
        }
    else:
        body = {
            "code": _code_for_status(exc.status_code),
            "message": str(detail) if detail else "An error occurred",
            "details": None,
        }
    return JSONResponse(
        status_code=exc.status_code,
        content=body,
        headers=exc.headers,
    )


async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    """Normalize Pydantic validation errors."""
    errors = []
    for err in exc.errors():
        errors.append({
            "field": ".".join(str(p) for p in err.get("loc", [])),
            "message": err.get("msg", ""),
        })
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "code": ErrorCode.VALIDATION_ERROR,
            "message": "Request validation failed",
            "details": errors,
        },
    )
