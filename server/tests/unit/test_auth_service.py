"""Unit tests for auth service – pure logic, no database required."""

from datetime import datetime, timezone

from app.config import settings
from app.services.auth_service import (
    create_access_token,
    create_websocket_token,
    hash_password,
    verify_password,
)
import jwt


# --------------------------------------------------------------------------- #
# Password hashing
# --------------------------------------------------------------------------- #


class TestPasswordHashing:
    def test_hash_returns_different_string(self):
        hashed = hash_password("mypassword")
        assert hashed != "mypassword"

    def test_verify_correct_password(self):
        hashed = hash_password("securePass123")
        assert verify_password("securePass123", hashed) is True

    def test_verify_wrong_password(self):
        hashed = hash_password("securePass123")
        assert verify_password("wrongPassword", hashed) is False

    def test_different_passwords_produce_different_hashes(self):
        h1 = hash_password("password1")
        h2 = hash_password("password2")
        assert h1 != h2

    def test_same_password_produces_different_hashes_due_to_salt(self):
        h1 = hash_password("samePassword")
        h2 = hash_password("samePassword")
        # bcrypt uses random salt, so hashes differ
        assert h1 != h2
        # But both should verify correctly
        assert verify_password("samePassword", h1) is True
        assert verify_password("samePassword", h2) is True


# --------------------------------------------------------------------------- #
# JWT token creation
# --------------------------------------------------------------------------- #


class TestAccessToken:
    def test_token_contains_user_id(self):
        token = create_access_token("user-abc-123", "customer")
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm], audience="crowbar-staff-api")
        assert payload["sub"] == "user-abc-123"

    def test_token_contains_user_type(self):
        token = create_access_token("user-1", "staff")
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm], audience="crowbar-staff-api")
        assert payload["user_type"] == "staff"

    def test_token_has_expiration(self):
        token = create_access_token("user-1", "customer")
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm], audience="crowbar-staff-api")
        assert "exp" in payload

    def test_token_is_decodable_string(self):
        token = create_access_token("user-1", "customer")
        assert isinstance(token, str)
        # Should have 3 parts separated by dots (JWT format)
        assert len(token.split(".")) == 3


class TestWebSocketToken:
    def test_token_is_short_lived_and_business_bound(self):
        token = create_websocket_token("user-1", "business-1")
        payload = jwt.decode(
            token, settings.secret_key, algorithms=[settings.algorithm], audience="crowbar-staff-websocket"
        )

        assert payload["sub"] == "user-1"
        assert payload["business_id"] == "business-1"
        assert payload["token_use"] == "websocket"
        remaining = payload["exp"] - int(datetime.now(timezone.utc).timestamp())
        assert 0 < remaining <= 120
