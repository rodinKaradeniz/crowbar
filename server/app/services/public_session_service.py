import hashlib

from fastapi import Request, Response

from app.config import settings


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def cookie_name(kind: str) -> str:
    prefix = "__Host-" if settings.environment == "production" else ""
    return f"{prefix}crowbar-{kind}"


def set_public_cookie(
    response: Response, *, kind: str, token: str, max_age: int = 12 * 60 * 60
) -> None:
    response.set_cookie(
        key=cookie_name(kind),
        value=token,
        max_age=max_age,
        secure=settings.environment == "production",
        httponly=True,
        samesite="lax",
        path="/",
    )


def get_public_cookie(request: Request, *, kind: str) -> str | None:
    return request.cookies.get(cookie_name(kind))


def clear_public_cookie(response: Response, *, kind: str) -> None:
    response.delete_cookie(
        key=cookie_name(kind),
        secure=settings.environment == "production",
        httponly=True,
        samesite="lax",
        path="/",
    )
