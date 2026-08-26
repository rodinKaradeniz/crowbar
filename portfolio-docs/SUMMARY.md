# Crowbar — public mirror summary

Short, reviewer-facing summaries of the product, architecture, and design. The
canonical, internal versions live in `docs/PRODUCT.md`,
`docs/ARCHITECTURE.md`, and `docs/DESIGN.md` and are not exported.

## Product

Crowbar supports a supervised single-location hospitality pilot: venue and
staff setup, reservations and future waitlist, walk-in queue, areas and tables,
seatings, menu and QR/staff orders, preparation routing, tabs, inventory,
purchasing, customer operations, and reporting.

The venue's separate compliant register remains the payment and fiscal
authority. Crowbar does not take payment or issue receipts or invoices. The
product records only that a tab was **settled externally**, with an audit trail.

Guest information is business-scoped. The venue is the data controller and
Crowbar is its software processor. Operational messages are not marketing
consent; retention follows venue configuration.

## Architecture

Crowbar is a three-service application: a Next.js browser/BFF client, a
FastAPI operational API, and a private FastAPI ML service. PostgreSQL is the
authority for durable state; Redis carries bounded real-time events and rate
limits.

Every tenant-owned service and query receives an explicit `business_id`.
Composite database constraints reinforce cross-table tenant alignment without
using row-level security. Mutations commit before events are published, and
WebSocket clients replace local state from an authoritative snapshot after
reconnect.

Guest links exchange a fragment credential for a purpose-scoped HttpOnly
cookie. Staff WebSockets authenticate with a short-lived business-bound frame
before receiving data. A table QR creates a pending browser session tied to a
current seating; staff approval is required before orders can be placed.

Schema evolution uses ordered, append-only SQL migrations. Public APIs use
explicit projections rather than reusing staff response models.

## Design

The interface uses a warm hospitality palette, high-contrast operational
states, keyboard-accessible Radix primitives, and responsive layouts for host,
floor, preparation, and guest workflows. Status is expressed with text as well
as color. Money, dates, times, phone numbers, and tax labels follow tenant
configuration.

Portfolio visuals are code-generated gradients and patterns. The public mirror
contains no third-party photography with unknown rights.
