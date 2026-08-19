import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";

import { QueueJoinClient } from "@/app/queue/[business]/join-client";
import type { Business } from "@/types";
import { server } from "../mocks/handlers";

const business = {
  id: "biz-queue",
  name: "Measured Bar",
  slug: "measured-bar",
} as Business;

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function service(overrides: Record<string, unknown>) {
  server.use(http.get("/api/backend/queue/biz-queue/service", () => HttpResponse.json({
    service_date: "2026-08-19", status: "open", is_open: true, is_full: false,
    max_waiting_covers: 20, waiting_covers: 4, estimated_wait_minutes: null,
    ...overrides,
  })));
}

describe("public current-service queue states", () => {
  it("shows a truthful closed state", async () => {
    service({ status: "closed", is_open: false });
    render(<QueueJoinClient business={business} />);
    expect(await screen.findByRole("heading", { name: "The queue is closed" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Join queue" })).not.toBeInTheDocument();
  });

  it("shows a full state without exposing a join form", async () => {
    service({ is_full: true, waiting_covers: 20 });
    render(<QueueJoinClient business={business} />);
    expect(await screen.findByRole("heading", { name: "The queue is full" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Join queue" })).not.toBeInTheDocument();
  });

  it("omits a fabricated estimate when history is insufficient", async () => {
    service({ estimated_wait_minutes: null });
    render(<QueueJoinClient business={business} />);
    expect(await screen.findByText(/once enough recent seating history is available/i)).toBeInTheDocument();
    expect(screen.queryByText(/a few minutes/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Join queue" })).toBeInTheDocument();
  });
});
