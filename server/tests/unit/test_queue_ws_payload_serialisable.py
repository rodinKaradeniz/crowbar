"""The queue socket's frames must survive `json.dumps`.

WHY THIS EXISTS. `queue_service.entry_to_dict` returns `service_date` as a
`datetime.date` and `joined_at`/`called_at`/`seated_at` as `datetime`s.
`WebSocket.send_json` and `QueueConnectionManager.broadcast` both go through
`json.dumps`, which raises `TypeError` on either type — and `TypeError` is not
a `WebSocketDisconnect`, so it escaped the router's handler and tore the socket
down with close code 1006.

The failure was invisible in two ways. An EMPTY queue serialises an empty list
and connects perfectly, so the board looked healthy until the first party
joined. And the HTTP projection was never affected, because it goes through
Pydantic, which encodes both types — so every queue test that read over HTTP
passed while the live socket had never once delivered a frame to a non-empty
board. Measured before the fix: 56 identical open → authenticated → 1006
cycles in 12 seconds.

These tests deliberately assert on the ENCODER's output rather than on a live
socket: the bug was a serialisation contract, and this is the cheapest place to
hold it. `test_raw_entry_dict_is_not_json_safe` pins the reason the encoder is
required, so that if `entry_to_dict` is ever changed to emit strings, this test
fails and tells the next person the wrapper is now redundant rather than
leaving it as cargo.
"""

import json
from datetime import date, datetime, timezone

import pytest
from fastapi.encoders import jsonable_encoder


def _entry_dict() -> dict:
    """The shape `queue_service.entry_to_dict` returns, in the failing case."""
    return {
        "id": "f6c6a1e2-b736-4532-abf5-8d0a297c56c4",
        "business_id": "00000000-0000-0000-0000-000000000002",
        "name": "Walk-in party",
        "party_size": 2,
        "phone": None,
        "status": "waiting",
        "position": 1,
        "service_date": date(2026, 9, 10),
        "joined_at": datetime(2026, 9, 10, 8, 2, 34, tzinfo=timezone.utc),
        "called_at": None,
        "seated_at": None,
        "completed_at": None,
        "removed_at": None,
        "terminal_reason_code": None,
        "terminal_reason_note": None,
        "delivery": None,
    }


def test_raw_entry_dict_is_not_json_safe():
    """The reason the encoder is not optional. If this ever fails, the dict
    became JSON-safe on its own and the wrappers can go."""
    with pytest.raises(TypeError):
        json.dumps({"type": "queue_updated", "entries": [_entry_dict()]})


def test_encoded_frame_is_json_safe():
    frame = jsonable_encoder({"type": "queue_updated", "entries": [_entry_dict()]})
    json.dumps(frame)  # must not raise


def test_encoding_preserves_the_keys_the_client_maps():
    """`toQueueEntryFromWS` in client/hooks/use-queue-socket.ts reads snake_case
    keys and expects the two temporal fields as strings. Encoding must not
    rename or drop anything it reads."""
    raw = _entry_dict()
    entry = jsonable_encoder({"type": "queue_updated", "entries": [raw]})["entries"][0]

    assert set(entry) == set(raw), "the client maps these keys by name"
    assert entry["service_date"] == "2026-09-10"
    assert isinstance(entry["joined_at"], str)
    assert entry["joined_at"].startswith("2026-09-10T08:02:34")
    # Nulls stay null rather than becoming the string "None": the client treats
    # them as absent (`(e.called_at as string) || undefined`).
    assert entry["called_at"] is None
    assert entry["party_size"] == 2 and entry["position"] == 1


def test_empty_queue_was_always_safe():
    """Why the bug hid: with no entries there is nothing unserialisable, so the
    socket connected and stayed up until the first party joined."""
    json.dumps({"type": "queue_updated", "entries": []})
