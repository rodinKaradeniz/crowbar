# Architecture summary

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
