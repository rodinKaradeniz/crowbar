"""Operational reporting over the venue's own service log.

Every route takes an explicit `start`/`end` window — no report renders a fixed
period — and every route has a CSV twin so a manager can take a figure into
whatever they already use. Guards split three ways:

* `reports.service` — what happened on the floor: bookings, queue, tables,
  stations, and the three value figures.
* `reports.cost` — what it cost: stock movement, waste and purchasing.
* `reports.staff_actions` — who did the accountable things.

None of these is an accounting or fiscal report, and none may present ordered,
open-tab or externally settled value as revenue. See `docs/PRODUCT.md`.
"""

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.csv_export import csv_response
from app.core.errors import ErrorCode, api_error
from app.database import get_db
from app.dependencies import get_current_business, require_capability, require_module
from app.models.business import Business
from app.services import cost_control_service, reporting_service
from app.services.reporting_service import ReportError, Window

router = APIRouter(prefix="/api/reports", tags=["reports"])


def _window(start: datetime, end: datetime) -> Window:
    try:
        return Window.of(start, end)
    except ReportError as exc:
        raise api_error(422, ErrorCode.VALIDATION_ERROR, str(exc)) from exc


def _range(
    start: datetime = Query(..., description="Inclusive start of the reporting window"),
    end: datetime = Query(..., description="Exclusive end of the reporting window"),
) -> Window:
    return _window(start, end)


def _suffix(window: Window) -> str:
    """A filename fragment naming the range, so a saved export stays identifiable."""
    return f"{window.start.date().isoformat()}_{window.end.date().isoformat()}"


# ─── Service reports ─────────────────────────────────────────────────────────

_SERVICE = [Depends(require_capability("reports.service"))]


@router.get("/reservations", dependencies=_SERVICE)
async def reservation_outcomes(
    window: Window = Depends(_range),
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
):
    return await reporting_service.reservation_outcomes(db, business.id, window)


@router.get(
    "/queue",
    dependencies=_SERVICE + [Depends(require_module("queue"))],
)
async def queue_conversion(
    window: Window = Depends(_range),
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
):
    return await reporting_service.queue_conversion(db, business.id, window)


@router.get("/tables", dependencies=_SERVICE)
async def table_utilization(
    window: Window = Depends(_range),
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
):
    return await reporting_service.table_utilization(db, business.id, window)


@router.get(
    "/tables.csv",
    dependencies=_SERVICE,
)
async def table_utilization_csv(
    window: Window = Depends(_range),
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
):
    report = await reporting_service.table_utilization(db, business.id, window)
    return csv_response(
        f"tables-{_suffix(window)}.csv",
        ["table_name", "seatings", "covers", "average_turn_minutes", "still_open"],
        report["tables"],
    )


@router.get(
    "/stations",
    dependencies=_SERVICE + [Depends(require_module("ordering"))],
)
async def station_throughput(
    window: Window = Depends(_range),
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
):
    return await reporting_service.station_throughput(db, business.id, window)


@router.get(
    "/stations.csv",
    dependencies=_SERVICE + [Depends(require_module("ordering"))],
)
async def station_throughput_csv(
    window: Window = Depends(_range),
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
):
    report = await reporting_service.station_throughput(db, business.id, window)
    rows = [
        {
            "station": station["station"],
            "item_name": item["item_name"],
            "quantity": item["quantity"],
            "lines": item["lines"],
            "average_ticket_minutes": station.get("average_ticket_minutes"),
        }
        for station in report["stations"]
        for item in station["items"]
    ]
    return csv_response(
        f"stations-{_suffix(window)}.csv",
        ["station", "item_name", "quantity", "lines", "average_ticket_minutes"],
        rows,
    )


@router.get(
    "/value",
    dependencies=_SERVICE + [Depends(require_module("ordering"))],
)
async def tab_value(
    window: Window = Depends(_range),
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
):
    """Ordered, open-tab and externally settled value — three separate figures.

    They are returned side by side and never summed. The client must label each
    one distinctly; `value_disclosure` carries the wording.
    """
    report = await reporting_service.tab_value(db, business.id, window)
    return {**report, "currency_code": business.currency_code}


@router.get(
    "/value.csv",
    dependencies=_SERVICE + [Depends(require_module("ordering"))],
)
async def tab_value_csv(
    window: Window = Depends(_range),
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
):
    report = await reporting_service.tab_value(db, business.id, window)
    rows = [
        {
            "figure": "Ordered value",
            "amount": report["ordered_value"],
            "currency_code": business.currency_code,
            "count": report["orders"],
            "note": "What guests asked for. Not revenue.",
        },
        {
            "figure": "Open-tab value",
            "amount": report["open_tab_value"],
            "currency_code": business.currency_code,
            "count": report["open_tabs"],
            "note": "Still on tables and unsettled. Not revenue.",
        },
        {
            "figure": "Externally settled value",
            "amount": report["externally_settled_value"],
            "currency_code": business.currency_code,
            "count": report["settlements"],
            "note": "Recorded by this venue's own register. Not an accounting record.",
        },
    ]
    return csv_response(
        f"value-{_suffix(window)}.csv",
        ["figure", "amount", "currency_code", "count", "note"],
        rows,
    )


# ─── Cost reports ────────────────────────────────────────────────────────────

_COST = [
    Depends(require_capability("reports.cost")),
    Depends(require_module("inventory")),
]


@router.get("/stock", dependencies=_COST)
async def stock_activity(
    window: Window = Depends(_range),
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
):
    report = await reporting_service.stock_activity(db, business.id, window)
    return {**report, "currency_code": business.currency_code}


@router.get("/stock.csv", dependencies=_COST)
async def stock_activity_csv(
    window: Window = Depends(_range),
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
):
    report = await reporting_service.stock_activity(db, business.id, window)
    rows = [
        {**entry, "currency_code": business.currency_code} for entry in report["waste"]
    ]
    return csv_response(
        f"waste-{_suffix(window)}.csv",
        ["item_name", "reason", "movements", "quantity", "waste_value", "currency_code"],
        rows,
    )


@router.get("/purchasing", dependencies=_COST)
async def purchasing_spend(
    window: Window = Depends(_range),
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
):
    report = await reporting_service.purchasing_spend(db, business.id, window)
    return {**report, "currency_code": business.currency_code}


@router.get("/purchasing.csv", dependencies=_COST)
async def purchasing_spend_csv(
    window: Window = Depends(_range),
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
):
    report = await reporting_service.purchasing_spend(db, business.id, window)
    rows = [
        {**entry, "currency_code": business.currency_code}
        for entry in report["by_supplier"]
    ]
    return csv_response(
        f"purchasing-{_suffix(window)}.csv",
        ["supplier_name", "receipts", "received_value", "currency_code"],
        rows,
    )


@router.get("/cogs", dependencies=_COST)
async def controllable_cogs(
    window: Window = Depends(_range),
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
):
    """Controllable COGS over an arbitrary window.

    Reuses `cost_control_service`, which already takes a window and already
    reports its own incompleteness. Duplicating the calculation here would give
    the Reports page and the Inventory page two ways to disagree.
    """
    report = await cost_control_service.controllable_cogs(
        db,
        business.id,
        business.currency_code,
        start=window.start,
        end=window.end,
    )
    return {
        **report,
        "window": window.as_dict(),
        "currency_code": business.currency_code,
        "disclosure": cost_control_service.DISCLOSURE,
    }


# ─── Staff actions ───────────────────────────────────────────────────────────

_STAFF_ACTIONS = [Depends(require_capability("reports.staff_actions"))]


@router.get("/staff-actions", dependencies=_STAFF_ACTIONS)
async def staff_actions(
    window: Window = Depends(_range),
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
):
    return await reporting_service.staff_actions(db, business.id, window)


@router.get("/staff-actions.csv", dependencies=_STAFF_ACTIONS)
async def staff_actions_csv(
    window: Window = Depends(_range),
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
):
    report = await reporting_service.staff_actions(db, business.id, window)
    return csv_response(
        f"staff-actions-{_suffix(window)}.csv",
        ["actor_name", "action", "count"],
        report["actions"],
    )
