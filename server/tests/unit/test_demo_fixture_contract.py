"""The frontend demo's recorded fixtures must still match this API.

`client/lib/demo/fixtures/recording.json` is what the frontend-only demo serves
in place of this backend. It is recorded from a seeded local stack by
`client/scripts/record-demo-fixtures.mjs`, so on the day it is recorded it is the
real contract. The API keeps moving and the recording does not, and a demo that
has drifted fails quietly — a page renders half a table, or nothing.

So this test is where drift gets loud. For every recorded read it asks:

- does a GET route with that path still exist?
- for a success, does the body still validate against that route's declared
  `response_model`? (Routes without one are checked for existence only.)
- for an error, is the body still the `{code, message, details}` envelope?

When it fails, re-run the recorder against a freshly seeded stack.
"""

import json
from pathlib import Path
from urllib.parse import urlsplit

import pytest
from fastapi.routing import APIRoute
from pydantic import TypeAdapter, ValidationError

from app.main import app

RECORDING = (
    Path(__file__).resolve().parents[3] / "client" / "lib" / "demo" / "fixtures" / "recording.json"
)


def _recording() -> dict:
    return json.loads(RECORDING.read_text(encoding="utf-8"))


def _recorded_reads() -> list[tuple[str, str, int, object]]:
    data = _recording()
    reads = []
    for audience, responses in data["responses"].items():
        for key, entry in responses.items():
            method, _, target = key.partition(" ")
            body = data["bodies"].get(entry["body"]) if "body" in entry else None
            reads.append((f"{audience}: {key}", method, entry["status"], (urlsplit(target).path, body)))
    return reads


def _get_route(path: str) -> APIRoute | None:
    for route in app.routes:
        if isinstance(route, APIRoute) and "GET" in route.methods and route.path_regex.match(path):
            return route
    return None


def test_recording_is_not_empty():
    assert _recording()["responses"], (
        "The demo recording is empty. Run client/scripts/record-demo-fixtures.mjs."
    )


@pytest.mark.parametrize(
    ("label", "method", "status", "request_and_body"),
    _recorded_reads(),
    ids=lambda value: value if isinstance(value, str) and ": " in value else "",
)
def test_recorded_read_matches_the_api(label, method, status, request_and_body):
    path, body = request_and_body
    assert method == "GET", f"{label}: the demo only records reads"

    route = _get_route(path)
    assert route is not None, f"{label}: no GET route serves {path} any more"

    if status >= 400:
        assert isinstance(body, dict) and {"code", "message"} <= body.keys(), (
            f"{label}: error body is no longer the {{code, message, details}} envelope"
        )
        return

    if route.response_model is None or body is None:
        return
    try:
        TypeAdapter(route.response_model).validate_python(body)
    except ValidationError as error:
        pytest.fail(f"{label}: body no longer matches {route.response_model!r}\n{error}")
