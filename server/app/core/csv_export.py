"""One way to hand a staff member a CSV.

Stage 5's count sheet was the first CSV in the repo and built its writer inline.
Stage 6's reports are the third-plus use, so the shape is extracted rather than
copied: buffered `csv.DictWriter` to a string, returned as a plain `Response`
with a download filename and a no-store cache header.

Buffered rather than streamed on purpose. Every export here is bounded by a date
range over a single venue's ledger, so the whole file fits in memory
comfortably, and a buffered writer can fail cleanly *before* any bytes reach the
client instead of truncating a half-written download.

`Cache-Control: private, no-store` matters: these files carry guest names, staff
actions and cost figures, and a shared browser cache is not where that belongs.
"""

import csv
import io
from datetime import date, datetime
from decimal import Decimal

from fastapi import Response


def _cell(value: object) -> str:
    """Render one value for a spreadsheet without inventing precision.

    A `None` becomes an empty cell rather than the string "None", so a missing
    figure reads as missing instead of as a value. Decimals are written at their
    own scale — the quantization decision belongs to the service that produced
    the number, not to the exporter.
    """
    if value is None:
        return ""
    if isinstance(value, bool):
        return "yes" if value else "no"
    if isinstance(value, Decimal):
        return format(value, "f")
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return str(value)


def render(columns: list[str], rows: list[dict]) -> str:
    """Serialize rows to CSV text with `columns` as both header and order.

    A key present in a row but absent from `columns` is dropped rather than
    silently appended, so adding a field to a service response cannot change an
    export's shape without someone deciding it should.
    """
    buffer = io.StringIO()
    writer = csv.DictWriter(
        buffer, fieldnames=columns, lineterminator="\n", extrasaction="ignore"
    )
    writer.writeheader()
    for row in rows:
        writer.writerow({column: _cell(row.get(column)) for column in columns})
    return buffer.getvalue()


def csv_response(filename: str, columns: list[str], rows: list[dict]) -> Response:
    """A downloadable CSV attachment, safe to serve over the authenticated proxy."""
    return Response(
        content=render(columns, rows),
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "private, no-store",
        },
    )
