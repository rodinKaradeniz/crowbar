"""The frontend demo's recorded fixtures must still match this API.

`client/lib/demo/fixtures/recording.json` is what the frontend-only demo serves
in place of this backend. It is recorded from a seeded local stack by
`client/scripts/record-demo-fixtures.mjs`, so on the day it is recorded it is the
real contract. The API keeps moving and the recording does not, and a demo that
has drifted fails quietly — a page renders half a table, or nothing.

So this test is where drift gets loud. Against the app's own OpenAPI document
it asks, for every recorded read:

- does a GET operation with that path still exist?
- for a success whose declared response is a named model (or a list of one),
  does the body still validate against that Pydantic model? Responses declared
  without a model are checked for existence only.
- for an error, is the body still the `{code, message, details}` envelope?

When it fails, re-run the recorder against a freshly seeded stack.
"""

import importlib
import json
import pkgutil
import re
from functools import cache
from pathlib import Path
from urllib.parse import urlsplit

import pytest
from pydantic import BaseModel, TypeAdapter, ValidationError

import app.schemas as schemas_package
from app.main import app as fastapi_app

RECORDING = (
    Path(__file__).resolve().parents[3] / "client" / "lib" / "demo" / "fixtures" / "recording.json"
)


#: Routes the frontend still calls that are served with `include_in_schema=False`,
#: mapped to the documented route sharing their handler and response model.
#: Remove an entry when the frontend stops calling the alias.
HIDDEN_ALIASES = {
    re.compile(r"^/api/queue/[^/]+/entries$"): "/api/queue/entries",  # routers/queue.py
}


def _recording() -> dict:
    return json.loads(RECORDING.read_text(encoding="utf-8"))


def _recorded_reads() -> list[tuple[str, str, int, tuple[str, object]]]:
    data = _recording()
    reads = []
    for audience, responses in data["responses"].items():
        for key, entry in responses.items():
            method, _, target = key.partition(" ")
            body = data["bodies"].get(entry["body"]) if "body" in entry else None
            reads.append((f"{audience}: {key}", method, entry["status"], (urlsplit(target).path, body)))
    return reads


@cache
def _get_operations() -> list[tuple[re.Pattern, dict]]:
    operations = []
    # Fewest parameters first, so `/reservations/waitlist` wins over `/reservations/{id}`.
    for template, item in sorted(fastapi_app.openapi()["paths"].items(), key=lambda pair: pair[0].count("{")):
        if "get" in item:
            pattern = re.compile("^" + re.sub(r"\{[^/]+\}", "[^/]+", re.escape(template).replace(r"\{", "{").replace(r"\}", "}")) + "$")
            operations.append((pattern, item["get"]))
    return operations


@cache
def _models_by_name() -> dict[str, type[BaseModel]]:
    models: dict[str, type[BaseModel]] = {}
    for module_info in pkgutil.iter_modules(schemas_package.__path__):
        module = importlib.import_module(f"app.schemas.{module_info.name}")
        for value in vars(module).values():
            if isinstance(value, type) and issubclass(value, BaseModel) and value is not BaseModel:
                models.setdefault(value.__name__, value)
    return models


def _declared_type(operation: dict) -> object | None:
    schema = (
        operation["responses"].get("200", {}).get("content", {}).get("application/json", {}).get("schema", {})
    )
    ref = schema.get("$ref")
    if ref:
        return _models_by_name().get(ref.rsplit("/", 1)[-1])
    items_ref = schema.get("items", {}).get("$ref") if schema.get("type") == "array" else None
    if items_ref:
        model = _models_by_name().get(items_ref.rsplit("/", 1)[-1])
        return list[model] if model else None
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

    path = next((canonical for alias, canonical in HIDDEN_ALIASES.items() if alias.match(path)), path)
    operation = next((op for pattern, op in _get_operations() if pattern.match(path)), None)
    assert operation is not None, f"{label}: no GET operation serves {path} any more"

    if status >= 400:
        assert isinstance(body, dict) and {"code", "message"} <= body.keys(), (
            f"{label}: error body is no longer the {{code, message, details}} envelope"
        )
        return

    declared = _declared_type(operation)
    if declared is None or body is None:
        return
    try:
        TypeAdapter(declared).validate_python(body)
    except ValidationError as error:
        pytest.fail(f"{label}: body no longer matches {declared!r}\n{error}")
