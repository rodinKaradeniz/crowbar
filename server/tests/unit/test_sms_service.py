import requests
import twilio.rest

from app.services import sms_service


class _TimingOutClient:
    """Stands in for `twilio.rest.Client`; there are no credentials locally."""

    built_with: dict = {}

    def __init__(self, sid, token, *, http_client=None):
        _TimingOutClient.built_with = {"http_client": http_client}
        self.messages = self

    def create(self, **_params):
        raise requests.exceptions.Timeout("provider did not answer")


def _configure(monkeypatch):
    monkeypatch.setattr(sms_service.settings, "twilio_account_sid", "AC-test")
    monkeypatch.setattr(sms_service.settings, "twilio_auth_token", "token-test")
    monkeypatch.setattr(sms_service.settings, "twilio_from_number", "+15005550006")
    monkeypatch.setattr(twilio.rest, "Client", _TimingOutClient)


def test_the_twilio_client_is_built_with_a_bounded_timeout(monkeypatch):
    _configure(monkeypatch)

    sms_service.send_sms("+4915112345678", "Your table is ready.")

    http_client = _TimingOutClient.built_with["http_client"]
    assert http_client is not None
    assert http_client.timeout == sms_service.SMS_TIMEOUT_SECONDS
    assert 0 < sms_service.SMS_TIMEOUT_SECONDS <= 30


def test_a_provider_timeout_is_a_failed_send_not_an_exception(monkeypatch):
    _configure(monkeypatch)

    assert sms_service.send_sms("+4915112345678", "Your table is ready.") is False
