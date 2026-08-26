"""Operational reports over the ledgers the service loop already writes.

Every figure here is derived at read time from immutable operational facts —
reservation statuses, queue transitions, seatings, order lines, settlement
events, stock movements, receipts. Nothing is denormalized, nothing is cached,
and no report writes.

Two rules constrain this file, both from `docs/PRODUCT.md`:

**Vocabulary.** Reports distinguish *ordered value* (what guests asked for),
*open-tab value* (what is on tables right now) and *externally settled value*
(what the venue's own compliant register recorded). None of the three is
revenue, accounting output, or a fiscal figure, and none may be added to the
others as though it were a total. Crowbar is not the payment or fiscal
authority; the venue's separate register is.

**Honesty.** A figure that cannot be computed says so. Every report carries a
`complete` flag and, when false, the specific reason — following the precedent
`cost_control_service` set in stage 5. Substituting zero for a missing input is
a product defect, not a rounding choice.
"""

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import Float, and_, case, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.inventory import InventoryItem, StockMovement
from app.models.inventory_operations import InventoryCountLine, InventoryCountSession
from app.models.order import Order, OrderLineItem, OrderLineStatusTimeline
from app.models.purchasing import (
    PurchaseOrder,
    PurchaseReceipt,
    PurchaseReceiptLine,
    Supplier,
)
from app.models.queue_entry import QueueEntry
from app.models.reservation import Reservation
from app.models.reservation_waitlist import ReservationWaitlistEntry
from app.models.table_seating import TableSeating, TableSeatingTable
from app.models.tab import Tab, TabSettlementEvent
from app.models.table import Table
from app.models.user import User

DISCLOSURE = (
    "Operational records from this venue's own service log. "
    "Not accounting, fiscal or payment records."
)

VALUE_DISCLOSURE = (
    "Ordered value is what guests asked for. Open-tab value is what is still on "
    "tables. Externally settled value is what this venue's own register "
    "recorded. They are three different figures and none of them is revenue."
)


class ReportError(ValueError):
    def __init__(self, message: str, *, code: str = "VALIDATION_ERROR"):
        self.code = code
        super().__init__(message)


@dataclass(frozen=True)
class Window:
    """A closed-open reporting range, always supplied by the caller.

    Stage 5's analytics hard-coded 30 days everywhere, which was the operators'
    main complaint about the existing surfaces. Every report here takes its
    window explicitly and echoes it back, so a screenshot of a number always
    carries the range it covers.
    """

    start: datetime
    end: datetime

    @staticmethod
    def of(start: datetime, end: datetime) -> "Window":
        if end <= start:
            raise ReportError("The end of the range must be after its start")
        return Window(start=start, end=end)

    def as_dict(self) -> dict:
        return {"start": self.start.isoformat(), "end": self.end.isoformat()}


def _rate(numerator: int, denominator: int) -> float | None:
    """A percentage, or None when there is nothing to divide by.

    Deliberately not 0.0: "no bookings, so no no-show rate" and "bookings, none
    of which no-showed" are different facts and must not render identically.
    """
    if denominator <= 0:
        return None
    return round(numerator / denominator * 100, 1)


def _minutes(seconds: float | None) -> float | None:
    if seconds is None:
        return None
    return round(seconds / 60, 1)


# ─── Reservations, covers and no-shows ───────────────────────────────────────


async def reservation_outcomes(
    db: AsyncSession, business_id: UUID, window: Window
) -> dict:
    """What happened to the bookings in this window.

    No-shows are counted as their own outcome rather than being folded into
    cancellations. `analytics_service.get_reservation_kpis` resolved only
    completed and cancelled, so its two rates were not complements once a
    no-show existed — a manager could not see the no-show problem at all, even
    though `reservations.no_show_at` has recorded it since stage 1.
    """
    rows = (
        await db.execute(
            select(
                Reservation.status,
                func.count(Reservation.id),
                func.coalesce(func.sum(Reservation.guests), 0),
            )
            .where(
                Reservation.business_id == business_id,
                Reservation.time >= window.start,
                Reservation.time < window.end,
            )
            .group_by(Reservation.status)
        )
    ).all()

    by_status = {status: {"count": count, "guests": guests} for status, count, guests in rows}
    booked = sum(entry["count"] for entry in by_status.values())
    covers = sum(entry["guests"] for entry in by_status.values())

    def count_of(status: str) -> int:
        return by_status.get(status, {}).get("count", 0)

    no_shows = count_of("no_show")
    cancelled = count_of("cancelled")
    completed = count_of("completed")

    late_cancellations = (
        await db.scalar(
            select(func.count(Reservation.id)).where(
                Reservation.business_id == business_id,
                Reservation.time >= window.start,
                Reservation.time < window.end,
                Reservation.cancelled_late.is_(True),
            )
        )
    ) or 0

    reconfirmed = (
        await db.scalar(
            select(func.count(Reservation.id)).where(
                Reservation.business_id == business_id,
                Reservation.time >= window.start,
                Reservation.time < window.end,
                Reservation.reconfirmed_at.isnot(None),
            )
        )
    ) or 0

    return {
        "window": window.as_dict(),
        "booked": booked,
        "covers": covers,
        "by_status": {
            status: entry["count"] for status, entry in sorted(by_status.items())
        },
        "completed": completed,
        "cancelled": cancelled,
        "late_cancellations": late_cancellations,
        "no_shows": no_shows,
        "reconfirmed": reconfirmed,
        "no_show_rate_percent": _rate(no_shows, booked),
        "cancellation_rate_percent": _rate(cancelled, booked),
        "completion_rate_percent": _rate(completed, booked),
        "complete": True,
        "incomplete_reason": None,
        "disclosure": DISCLOSURE,
    }


# ─── Queue wait and seating conversion ───────────────────────────────────────


async def queue_conversion(
    db: AsyncSession, business_id: UUID, window: Window
) -> dict:
    """How long walk-ins waited, and how many of them actually sat down.

    Wait is measured `joined_at` → `seated_at`, so only parties that were seated
    contribute to it. A party that left after 40 minutes has no wait figure by
    construction, which is why `seated` is reported next to it — a fast average
    wait over a handful of seated parties is not a good service day.
    """
    joined = (
        await db.scalar(
            select(func.count(QueueEntry.id)).where(
                QueueEntry.business_id == business_id,
                QueueEntry.joined_at >= window.start,
                QueueEntry.joined_at < window.end,
            )
        )
    ) or 0

    outcomes = (
        await db.execute(
            select(QueueEntry.status, func.count(QueueEntry.id))
            .where(
                QueueEntry.business_id == business_id,
                QueueEntry.joined_at >= window.start,
                QueueEntry.joined_at < window.end,
            )
            .group_by(QueueEntry.status)
        )
    ).all()
    by_status = {status: count for status, count in outcomes}
    seated = by_status.get("seated", 0) + by_status.get("completed", 0)
    removed = by_status.get("removed", 0)

    wait_seconds = func.extract(
        "epoch", QueueEntry.seated_at - QueueEntry.joined_at
    )
    wait_row = (
        await db.execute(
            select(
                func.avg(wait_seconds),
                func.percentile_cont(0.5).within_group(wait_seconds),
                func.max(wait_seconds),
            ).where(
                QueueEntry.business_id == business_id,
                QueueEntry.joined_at >= window.start,
                QueueEntry.joined_at < window.end,
                QueueEntry.seated_at.isnot(None),
            )
        )
    ).one()
    average_wait, median_wait, longest_wait = wait_row

    offered = (
        await db.scalar(
            select(func.count(ReservationWaitlistEntry.id)).where(
                ReservationWaitlistEntry.business_id == business_id,
                ReservationWaitlistEntry.offered_at >= window.start,
                ReservationWaitlistEntry.offered_at < window.end,
            )
        )
    ) or 0
    accepted = (
        await db.scalar(
            select(func.count(ReservationWaitlistEntry.id)).where(
                ReservationWaitlistEntry.business_id == business_id,
                ReservationWaitlistEntry.offered_at >= window.start,
                ReservationWaitlistEntry.offered_at < window.end,
                ReservationWaitlistEntry.accepted_at.isnot(None),
            )
        )
    ) or 0

    return {
        "window": window.as_dict(),
        "joined": joined,
        "seated": seated,
        "removed": removed,
        "by_status": dict(sorted(by_status.items())),
        "seating_conversion_percent": _rate(seated, joined),
        "average_wait_minutes": _minutes(float(average_wait) if average_wait else None),
        "median_wait_minutes": _minutes(float(median_wait) if median_wait else None),
        "longest_wait_minutes": _minutes(float(longest_wait) if longest_wait else None),
        "waitlist_offers": offered,
        "waitlist_accepted": accepted,
        "waitlist_acceptance_percent": _rate(accepted, offered),
        "complete": seated > 0 or joined == 0,
        "incomplete_reason": (
            "No party in this range was seated from the queue, so there is no wait "
            "time to report."
            if joined > 0 and seated == 0
            else None
        ),
        "disclosure": DISCLOSURE,
    }


# ─── Table utilization and turn time ─────────────────────────────────────────


async def table_utilization(
    db: AsyncSession, business_id: UUID, window: Window
) -> dict:
    """Seatings, covers and turn time per table.

    Turn time is `closed_at - opened_at` on a closed seating. Open seatings are
    counted but excluded from the average, because a table occupied right now
    has no turn time yet and averaging in a partial occupancy would understate
    it. `still_open` is reported so the gap is visible rather than silent.

    A seating references exactly one of a reservation or a queue entry (enforced
    by a CHECK since stage 3), so booked-versus-walk-in needs no extra column.
    """
    turn_seconds = func.extract("epoch", TableSeating.closed_at - TableSeating.opened_at)

    rows = (
        await db.execute(
            select(
                Table.id,
                Table.label,
                func.count(TableSeating.id),
                func.coalesce(func.sum(TableSeating.party_size), 0),
                func.avg(turn_seconds),
                func.sum(case((TableSeating.closed_at.is_(None), 1), else_=0)),
            )
            .join(TableSeatingTable, TableSeatingTable.table_id == Table.id)
            .join(TableSeating, TableSeating.id == TableSeatingTable.seating_id)
            .where(
                Table.business_id == business_id,
                TableSeating.business_id == business_id,
                TableSeating.opened_at >= window.start,
                TableSeating.opened_at < window.end,
            )
            .group_by(Table.id, Table.label)
            .order_by(func.count(TableSeating.id).desc(), Table.label)
        )
    ).all()

    tables = [
        {
            "table_id": str(table_id),
            "table_name": label,
            "seatings": seatings,
            "covers": covers,
            "average_turn_minutes": _minutes(float(turn) if turn else None),
            "still_open": int(open_count or 0),
        }
        for table_id, label, seatings, covers, turn, open_count in rows
    ]

    source_rows = (
        await db.execute(
            select(
                case(
                    (TableSeating.reservation_id.isnot(None), "reservation"),
                    (TableSeating.queue_entry_id.isnot(None), "queue"),
                    else_="walk_in",
                ).label("source"),
                func.count(TableSeating.id),
                func.coalesce(func.sum(TableSeating.party_size), 0),
            )
            .where(
                TableSeating.business_id == business_id,
                TableSeating.opened_at >= window.start,
                TableSeating.opened_at < window.end,
            )
            .group_by("source")
        )
    ).all()

    total_seatings = sum(row[1] for row in source_rows)
    still_open = sum(t["still_open"] for t in tables)

    return {
        "window": window.as_dict(),
        "seatings": total_seatings,
        "covers": sum(row[2] for row in source_rows),
        "by_source": {
            source: {"seatings": count, "covers": covers}
            for source, count, covers in sorted(source_rows)
        },
        "tables": tables,
        "seatings_still_open": still_open,
        "complete": still_open == 0,
        "incomplete_reason": (
            f"{still_open} seating(s) in this range are still open, so their turn "
            "time is not yet known and is excluded from the averages."
            if still_open
            else None
        ),
        "disclosure": DISCLOSURE,
    }


# ─── Ordered items by preparation station, and ticket timing ─────────────────


async def station_throughput(
    db: AsyncSession, business_id: UUID, window: Window
) -> dict:
    """What each station made, and how long its tickets took.

    Generalizes `order_service.get_all_day_counts`, which answers the same
    question for the current business day only. Ticket time is measured on the
    line rather than the order, because one order routed to both the bar and the
    kitchen has two independent clocks and an order-level average hides the slow
    one.

    Lines are attributed by `preparation_station_name`, the snapshot taken at
    order time. Reading through to the station record instead would relabel
    history whenever a station is renamed.
    """
    counts = (
        await db.execute(
            select(
                OrderLineItem.preparation_station_name,
                OrderLineItem.item_name,
                func.coalesce(func.sum(OrderLineItem.quantity), 0),
                func.count(OrderLineItem.id),
            )
            .join(Order, Order.id == OrderLineItem.order_id)
            .where(
                OrderLineItem.business_id == business_id,
                Order.placed_at >= window.start,
                Order.placed_at < window.end,
                Order.status != "cancelled",
            )
            .group_by(OrderLineItem.preparation_station_name, OrderLineItem.item_name)
            .order_by(
                OrderLineItem.preparation_station_name,
                func.sum(OrderLineItem.quantity).desc(),
            )
        )
    ).all()

    stations: dict[str, dict] = {}
    for station_name, item_name, quantity, lines in counts:
        key = station_name or "Unrouted"
        station = stations.setdefault(
            key, {"station": key, "items": [], "quantity": 0, "lines": 0}
        )
        station["items"].append(
            {"item_name": item_name, "quantity": int(quantity), "lines": lines}
        )
        station["quantity"] += int(quantity)
        station["lines"] += lines

    # Ticket time: the line's first 'received' row to its first 'ready' row.
    received = (
        select(
            OrderLineStatusTimeline.order_line_item_id.label("line_id"),
            func.min(OrderLineStatusTimeline.changed_at).label("at"),
        )
        .where(
            OrderLineStatusTimeline.business_id == business_id,
            OrderLineStatusTimeline.status == "received",
        )
        .group_by(OrderLineStatusTimeline.order_line_item_id)
        .subquery()
    )
    ready = (
        select(
            OrderLineStatusTimeline.order_line_item_id.label("line_id"),
            func.min(OrderLineStatusTimeline.changed_at).label("at"),
        )
        .where(
            OrderLineStatusTimeline.business_id == business_id,
            OrderLineStatusTimeline.status == "ready",
        )
        .group_by(OrderLineStatusTimeline.order_line_item_id)
        .subquery()
    )
    ticket_seconds = func.extract("epoch", ready.c.at - received.c.at)

    timings = (
        await db.execute(
            select(
                OrderLineItem.preparation_station_name,
                func.avg(ticket_seconds),
                func.percentile_cont(0.5).within_group(ticket_seconds),
                func.count(),
            )
            .select_from(OrderLineItem)
            .join(Order, Order.id == OrderLineItem.order_id)
            .join(received, received.c.line_id == OrderLineItem.id)
            .join(ready, ready.c.line_id == OrderLineItem.id)
            .where(
                OrderLineItem.business_id == business_id,
                Order.placed_at >= window.start,
                Order.placed_at < window.end,
            )
            .group_by(OrderLineItem.preparation_station_name)
        )
    ).all()

    for station_name, average, median, timed_lines in timings:
        key = station_name or "Unrouted"
        station = stations.setdefault(
            key, {"station": key, "items": [], "quantity": 0, "lines": 0}
        )
        station["average_ticket_minutes"] = _minutes(float(average) if average else None)
        station["median_ticket_minutes"] = _minutes(float(median) if median else None)
        station["timed_lines"] = timed_lines

    ordered = sorted(stations.values(), key=lambda s: s["station"])
    untimed = [s["station"] for s in ordered if not s.get("timed_lines")]

    return {
        "window": window.as_dict(),
        "stations": ordered,
        "complete": not untimed,
        "incomplete_reason": (
            "No line at "
            + ", ".join(untimed)
            + " reached 'ready' in this range, so those stations have no ticket time."
            if untimed
            else None
        ),
        "disclosure": DISCLOSURE,
    }


# ─── Ordered / open-tab / externally settled value ───────────────────────────


async def tab_value(db: AsyncSession, business_id: UUID, window: Window) -> dict:
    """The three value figures, kept separate on purpose.

    `docs/PRODUCT.md` requires these to be distinguishable and forbids labelling
    any of them revenue, accounting output or fiscal output. They are not
    summable and are not presented as a total:

    * **ordered** — the value of orders placed in the window.
    * **open_tab** — what is currently sitting on unsettled tabs. A live sum,
      because an open tab is still moving.
    * **externally_settled** — `total_snapshot` from settlement events, the
      immutable figure captured when the venue's own register took payment.
      Never recomputed from orders: the snapshot is the record of what was
      asserted, and a later order correction must not rewrite it.

    Crowbar records no tenders, change, tips, refunds or processor status. This
    is an operational log of what the venue said happened elsewhere.
    """
    ordered_row = (
        await db.execute(
            select(
                func.coalesce(func.sum(Order.total_amount), 0),
                func.count(Order.id),
            ).where(
                Order.business_id == business_id,
                Order.placed_at >= window.start,
                Order.placed_at < window.end,
                Order.status != "cancelled",
            )
        )
    ).one()

    open_row = (
        await db.execute(
            select(
                func.coalesce(func.sum(Order.total_amount), 0),
                func.count(func.distinct(Tab.id)),
            )
            .select_from(Tab)
            .outerjoin(
                Order,
                and_(Order.tab_id == Tab.id, Order.status != "cancelled"),
            )
            .where(
                Tab.business_id == business_id,
                Tab.status == "open",
                Tab.opened_at < window.end,
            )
        )
    ).one()

    settled_row = (
        await db.execute(
            select(
                func.coalesce(func.sum(TabSettlementEvent.total_snapshot), 0),
                func.count(TabSettlementEvent.id),
            ).where(
                TabSettlementEvent.business_id == business_id,
                TabSettlementEvent.event_type == "settled_externally",
                TabSettlementEvent.occurred_at >= window.start,
                TabSettlementEvent.occurred_at < window.end,
            )
        )
    ).one()

    methods = (
        await db.execute(
            select(
                TabSettlementEvent.informational_method,
                func.count(TabSettlementEvent.id),
                func.coalesce(func.sum(TabSettlementEvent.total_snapshot), 0),
            )
            .where(
                TabSettlementEvent.business_id == business_id,
                TabSettlementEvent.event_type == "settled_externally",
                TabSettlementEvent.occurred_at >= window.start,
                TabSettlementEvent.occurred_at < window.end,
            )
            .group_by(TabSettlementEvent.informational_method)
        )
    ).all()

    return {
        "window": window.as_dict(),
        "ordered_value": Decimal(ordered_row[0]),
        "orders": ordered_row[1],
        "open_tab_value": Decimal(open_row[0]),
        "open_tabs": open_row[1],
        "externally_settled_value": Decimal(settled_row[0]),
        "settlements": settled_row[1],
        "settlement_methods": [
            {
                "informational_method": method or "unspecified",
                "settlements": count,
                "externally_settled_value": Decimal(total),
            }
            for method, count, total in sorted(methods, key=lambda r: r[0] or "")
        ],
        "complete": True,
        "incomplete_reason": None,
        "disclosure": DISCLOSURE,
        "value_disclosure": VALUE_DISCLOSURE,
    }


# ─── Stock movement and variance ─────────────────────────────────────────────


async def stock_activity(db: AsyncSession, business_id: UUID, window: Window) -> dict:
    """Movements by type, waste by reason, and what counts found.

    Waste value uses `unit_cost_snapshot`, the cost recorded on the movement
    itself. Movements posted before an item had a cost carry none, and those are
    counted in `movements_without_cost` rather than being valued at zero — the
    same rule `cost_control_service` follows.
    """
    by_type = (
        await db.execute(
            select(
                StockMovement.movement_type,
                func.count(StockMovement.id),
                func.coalesce(func.sum(func.abs(StockMovement.quantity_delta)), 0),
            )
            .where(
                StockMovement.business_id == business_id,
                StockMovement.created_at >= window.start,
                StockMovement.created_at < window.end,
            )
            .group_by(StockMovement.movement_type)
            .order_by(StockMovement.movement_type)
        )
    ).all()

    waste_rows = (
        await db.execute(
            select(
                StockMovement.reason,
                InventoryItem.name,
                func.count(StockMovement.id),
                func.coalesce(func.sum(func.abs(StockMovement.quantity_delta)), 0),
                func.coalesce(
                    func.sum(
                        func.abs(StockMovement.quantity_delta)
                        * func.coalesce(StockMovement.unit_cost_snapshot, 0)
                    ),
                    0,
                ),
            )
            .join(InventoryItem, InventoryItem.id == StockMovement.item_id)
            .where(
                StockMovement.business_id == business_id,
                StockMovement.movement_type == "waste",
                StockMovement.created_at >= window.start,
                StockMovement.created_at < window.end,
            )
            .group_by(StockMovement.reason, InventoryItem.name)
            .order_by(func.sum(func.abs(StockMovement.quantity_delta)).desc())
        )
    ).all()

    uncosted = (
        await db.scalar(
            select(func.count(StockMovement.id)).where(
                StockMovement.business_id == business_id,
                StockMovement.created_at >= window.start,
                StockMovement.created_at < window.end,
                StockMovement.unit_cost_snapshot.is_(None),
            )
        )
    ) or 0

    variance_rows = (
        await db.execute(
            select(
                InventoryCountSession.id,
                InventoryCountSession.kind,
                InventoryCountSession.reconciled_at,
                func.count(InventoryCountLine.id),
                func.coalesce(
                    func.sum(func.abs(InventoryCountLine.variance_quantity)), 0
                ),
            )
            .join(
                InventoryCountLine,
                InventoryCountLine.session_id == InventoryCountSession.id,
            )
            .where(
                InventoryCountSession.business_id == business_id,
                InventoryCountSession.reconciled_at >= window.start,
                InventoryCountSession.reconciled_at < window.end,
            )
            .group_by(
                InventoryCountSession.id,
                InventoryCountSession.kind,
                InventoryCountSession.reconciled_at,
            )
            .order_by(InventoryCountSession.reconciled_at.desc())
        )
    ).all()

    return {
        "window": window.as_dict(),
        "movements_by_type": [
            {"movement_type": kind, "movements": count, "quantity": float(quantity)}
            for kind, count, quantity in by_type
        ],
        "waste": [
            {
                "reason": reason or "unspecified",
                "item_name": item_name,
                "movements": count,
                "quantity": float(quantity),
                "waste_value": Decimal(value),
            }
            for reason, item_name, count, quantity, value in waste_rows
        ],
        "total_waste_value": Decimal(sum(row[4] for row in waste_rows)),
        "reconciled_counts": [
            {
                "session_id": str(session_id),
                "kind": kind,
                "reconciled_at": reconciled_at.isoformat() if reconciled_at else None,
                "lines": lines,
                "absolute_variance": float(variance),
            }
            for session_id, kind, reconciled_at, lines, variance in variance_rows
        ],
        "movements_without_cost": uncosted,
        "complete": uncosted == 0,
        "incomplete_reason": (
            f"{uncosted} movement(s) in this range carry no unit cost, so their "
            "value is missing from the waste figure rather than counted as zero."
            if uncosted
            else None
        ),
        "disclosure": DISCLOSURE,
    }


# ─── Purchasing cost ─────────────────────────────────────────────────────────


async def purchasing_spend(
    db: AsyncSession, business_id: UUID, window: Window
) -> dict:
    """What the venue committed to suppliers, by supplier and by item.

    Measured at receipt rather than at order, because an order is an intention
    and a receipt is what actually arrived. `unit_price` on a receipt line is a
    per-*pack* price — the per-base-unit cost lives in `purchase_price_history`
    under a deliberately different column name since migration 048 — so the
    multiplication here is packs × per-pack price, which is the money committed.
    """
    line_value = PurchaseReceiptLine.received_quantity * PurchaseReceiptLine.unit_price

    by_supplier = (
        await db.execute(
            select(
                Supplier.id,
                Supplier.name,
                func.count(func.distinct(PurchaseReceipt.id)),
                func.coalesce(func.sum(line_value), 0),
            )
            .select_from(PurchaseReceiptLine)
            .join(PurchaseReceipt, PurchaseReceipt.id == PurchaseReceiptLine.receipt_id)
            .join(PurchaseOrder, PurchaseOrder.id == PurchaseReceipt.purchase_order_id)
            .join(Supplier, Supplier.id == PurchaseOrder.supplier_id)
            .where(
                PurchaseReceiptLine.business_id == business_id,
                PurchaseReceipt.received_at >= window.start,
                PurchaseReceipt.received_at < window.end,
            )
            .group_by(Supplier.id, Supplier.name)
            .order_by(func.sum(line_value).desc())
        )
    ).all()

    by_item = (
        await db.execute(
            select(
                InventoryItem.id,
                InventoryItem.name,
                func.coalesce(func.sum(PurchaseReceiptLine.received_quantity), 0),
                func.coalesce(func.sum(line_value), 0),
            )
            .select_from(PurchaseReceiptLine)
            .join(PurchaseReceipt, PurchaseReceipt.id == PurchaseReceiptLine.receipt_id)
            .join(
                InventoryItem,
                InventoryItem.id == PurchaseReceiptLine.inventory_item_id,
            )
            .where(
                PurchaseReceiptLine.business_id == business_id,
                PurchaseReceipt.received_at >= window.start,
                PurchaseReceipt.received_at < window.end,
            )
            .group_by(InventoryItem.id, InventoryItem.name)
            .order_by(func.sum(line_value).desc())
        )
    ).all()

    order_states = (
        await db.execute(
            select(PurchaseOrder.status, func.count(PurchaseOrder.id))
            .where(
                PurchaseOrder.business_id == business_id,
                PurchaseOrder.created_at >= window.start,
                PurchaseOrder.created_at < window.end,
            )
            .group_by(PurchaseOrder.status)
        )
    ).all()

    discrepancies = (
        await db.scalar(
            select(func.count(PurchaseReceiptLine.id))
            .join(PurchaseReceipt, PurchaseReceipt.id == PurchaseReceiptLine.receipt_id)
            .where(
                PurchaseReceiptLine.business_id == business_id,
                PurchaseReceipt.received_at >= window.start,
                PurchaseReceipt.received_at < window.end,
                PurchaseReceiptLine.discrepancy_reason.isnot(None),
            )
        )
    ) or 0

    return {
        "window": window.as_dict(),
        "total_received_value": Decimal(sum(row[3] for row in by_supplier)),
        "by_supplier": [
            {
                "supplier_id": str(supplier_id),
                "supplier_name": name,
                "receipts": receipts,
                "received_value": Decimal(value),
            }
            for supplier_id, name, receipts, value in by_supplier
        ],
        "by_item": [
            {
                "item_id": str(item_id),
                "item_name": name,
                "packs_received": float(packs),
                "received_value": Decimal(value),
            }
            for item_id, name, packs, value in by_item
        ],
        "orders_by_status": dict(sorted(order_states)),
        "lines_with_discrepancies": discrepancies,
        "complete": True,
        "incomplete_reason": None,
        "disclosure": (
            "Purchase cost committed to suppliers, from this venue's own receiving "
            "records. Crowbar does not pay supplier invoices."
        ),
    }


# ─── Staff actions ───────────────────────────────────────────────────────────


async def staff_actions(db: AsyncSession, business_id: UUID, window: Window) -> dict:
    """Who did the accountable things, from the actor columns that already exist.

    Deliberately *not* a general audit log. `docs/PRODUCT.md` defers a
    platform-wide audit explorer to post-MVP, and introducing an audit-event
    table here would be a second write path on every mutation for a reporting
    convenience. These six columns were added when their workflows were built
    precisely so someone could be asked about the entry later.

    Only the actions worth a conversation are here: approving spend, reconciling
    a count, asserting an external settlement, and marking a guest a no-show.
    """
    actions: list[dict] = []

    async def collect(
        label: str, actor_column, at_column, table, extra_filter=None
    ) -> None:
        conditions = [
            table.business_id == business_id,
            at_column >= window.start,
            at_column < window.end,
            actor_column.isnot(None),
        ]
        if extra_filter is not None:
            conditions.append(extra_filter)
        rows = (
            await db.execute(
                select(User.id, User.name, func.count())
                .select_from(table)
                .join(User, User.id == actor_column)
                .where(*conditions)
                .group_by(User.id, User.name)
            )
        ).all()
        for user_id, name, count in rows:
            actions.append(
                {
                    "action": label,
                    "actor_id": str(user_id),
                    "actor_name": name,
                    "count": count,
                }
            )

    await collect(
        "Approved a purchase order",
        PurchaseOrder.approved_by,
        PurchaseOrder.approved_at,
        PurchaseOrder,
    )
    await collect(
        "Received a delivery",
        PurchaseReceipt.received_by,
        PurchaseReceipt.received_at,
        PurchaseReceipt,
    )
    await collect(
        "Reconciled a stock count",
        InventoryCountSession.reconciled_by,
        InventoryCountSession.reconciled_at,
        InventoryCountSession,
    )
    await collect(
        "Recorded an external settlement",
        TabSettlementEvent.actor_id,
        TabSettlementEvent.occurred_at,
        TabSettlementEvent,
        TabSettlementEvent.event_type == "settled_externally",
    )
    await collect(
        "Marked a reservation no-show",
        Reservation.no_show_by,
        Reservation.no_show_at,
        Reservation,
    )

    by_actor: dict[str, dict] = {}
    for entry in actions:
        actor = by_actor.setdefault(
            entry["actor_id"],
            {"actor_id": entry["actor_id"], "actor_name": entry["actor_name"], "actions": {}, "total": 0},
        )
        actor["actions"][entry["action"]] = entry["count"]
        actor["total"] += entry["count"]

    return {
        "window": window.as_dict(),
        "actors": sorted(by_actor.values(), key=lambda a: (-a["total"], a["actor_name"] or "")),
        "actions": sorted(actions, key=lambda a: (a["action"], a["actor_name"] or "")),
        "complete": True,
        "incomplete_reason": (
            "Covers approvals, receiving, count reconciliation, external settlement "
            "and no-shows. Crowbar does not keep a general audit log."
        ),
        "disclosure": DISCLOSURE,
    }
