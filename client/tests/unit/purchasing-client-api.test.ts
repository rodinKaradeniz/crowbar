/**
 * Wire-contract tests for the Stage 5 client API.
 *
 * The mappers are the only place snake_case meets camelCase, and the unit
 * meaning of a price changes across that boundary, so both directions are
 * asserted explicitly.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";

import { server } from "../mocks/handlers";
import {
  clientCreatePurchaseOrder,
  clientGetCostControl,
  clientGetCountSession,
  clientGetPriceHistory,
  clientGetPurchaseOrders,
  clientGetSuppliers,
  clientSaveCountLines,
} from "@/lib/client-api";

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const BUSINESS = "biz-1";

describe("clientGetSuppliers", () => {
  it("maps snake_case to camelCase and leaks no raw keys", async () => {
    server.use(
      http.get(`/api/proxy/purchasing/${BUSINESS}/suppliers`, () =>
        HttpResponse.json([
          {
            id: "s1",
            business_id: BUSINESS,
            name: "Fine Spirits",
            contact_name: "Ada",
            email: "ada@example.com",
            phone: null,
            address: null,
            notes: null,
            is_active: true,
            created_at: "2026-08-01T00:00:00Z",
            updated_at: "2026-08-01T00:00:00Z",
          },
        ]),
      ),
    );
    const suppliers = await clientGetSuppliers(BUSINESS);
    expect(suppliers[0].contactName).toBe("Ada");
    expect(suppliers[0].phone).toBeUndefined();
    const raw = suppliers[0] as unknown as Record<string, unknown>;
    expect(raw).not.toHaveProperty("contact_name");
    expect(raw).not.toHaveProperty("is_active");
  });
});

describe("clientCreatePurchaseOrder", () => {
  it("sends exactly the snake_case body the API expects", async () => {
    let body: unknown = null;
    server.use(
      http.post(`/api/proxy/purchasing/${BUSINESS}/purchase-orders`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({
          id: "po1",
          business_id: BUSINESS,
          supplier_id: "s1",
          status: "draft",
          lines: [],
        });
      }),
    );
    await clientCreatePurchaseOrder(BUSINESS, {
      supplierId: "s1",
      reference: "PO-9",
      lines: [
        {
          inventoryItemId: "i1",
          packConversionId: "p1",
          description: "Gin case",
          orderedQuantity: 2,
          unitPrice: 240,
        },
      ],
    });
    expect(body).toEqual({
      supplier_id: "s1",
      reference: "PO-9",
      lines: [
        {
          inventory_item_id: "i1",
          pack_conversion_id: "p1",
          description: "Gin case",
          ordered_quantity: 2,
          unit_price: 240,
        },
      ],
    });
  });
});

describe("clientGetPurchaseOrders", () => {
  it("passes the status filter and maps nested lines", async () => {
    let url = "";
    server.use(
      http.get(`/api/proxy/purchasing/${BUSINESS}/purchase-orders`, ({ request }) => {
        url = request.url;
        return HttpResponse.json([
          {
            id: "po1",
            business_id: BUSINESS,
            supplier_id: "s1",
            status: "partially_received",
            closure_reason: null,
            lines: [
              {
                id: "l1",
                inventory_item_id: "i1",
                description: "Gin case",
                ordered_quantity: "2.000",
                received_quantity: "1.000",
                pack_conversion_id: "p1",
                unit_price: "240.000000",
                currency_code: "EUR",
              },
            ],
          },
        ]);
      }),
    );
    const orders = await clientGetPurchaseOrders(BUSINESS, "partially_received");
    expect(url).toContain("order_status=partially_received");
    expect(orders[0].lines[0].orderedQuantity).toBe(2);
    // Decimals arrive as strings and must become numbers.
    expect(orders[0].lines[0].unitPrice).toBe(240);
    expect(orders[0].closureReason).toBeUndefined();
  });
});

describe("clientGetPriceHistory", () => {
  it("maps the per-base-unit cost, not a per-pack price", async () => {
    server.use(
      http.get(`/api/proxy/purchasing/${BUSINESS}/items/i1/price-history`, () =>
        HttpResponse.json([
          {
            id: "h1",
            inventory_item_id: "i1",
            supplier_product_id: null,
            receipt_line_id: "rl1",
            unit_cost_per_base_unit: "0.028571",
            currency_code: "EUR",
            observed_at: "2026-08-20T10:00:00Z",
          },
        ]),
      ),
    );
    const history = await clientGetPriceHistory(BUSINESS, "i1");
    expect(history[0].unitCostPerBaseUnit).toBeCloseTo(0.028571, 6);
    const raw = history[0] as unknown as Record<string, unknown>;
    expect(raw).not.toHaveProperty("unit_price");
    expect(raw).not.toHaveProperty("unit_cost_per_base_unit");
  });
});

describe("clientSaveCountLines", () => {
  it("sends only the entry form the caller supplied", async () => {
    let body: unknown = null;
    server.use(
      http.patch(`/api/proxy/inventory/${BUSINESS}/counts/c1/lines`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({
          id: "c1",
          business_id: BUSINESS,
          kind: "stocktake",
          status: "open",
          created_at: "2026-08-25T10:00:00Z",
          lines: [],
        });
      }),
    );
    await clientSaveCountLines(BUSINESS, "c1", [
      { countLineId: "cl1", packConversionId: "p1", packQuantity: 3.4 },
      { countLineId: "cl2", kegLevelPercent: 40 },
      { countLineId: "cl3", countedQuantity: 12, shrinkageReason: "breakage" },
    ]);
    expect(body).toEqual([
      { count_line_id: "cl1", pack_conversion_id: "p1", pack_quantity: 3.4 },
      { count_line_id: "cl2", keg_level_percent: 40 },
      { count_line_id: "cl3", counted_quantity: 12, shrinkage_reason: "breakage" },
    ]);
  });
});

describe("clientGetCountSession", () => {
  it("maps entry mode and variance", async () => {
    server.use(
      http.get(`/api/proxy/inventory/${BUSINESS}/counts/c1`, () =>
        HttpResponse.json({
          id: "c1",
          business_id: BUSINESS,
          location_id: null,
          kind: "stocktake",
          status: "open",
          created_at: "2026-08-25T10:00:00Z",
          lines: [
            {
              id: "cl1",
              inventory_item_id: "i1",
              item_name: "Gin",
              base_unit: "ml",
              book_quantity: "2800.000",
              counted_quantity: "2380.000",
              variance_quantity: "-420.000",
              shrinkage_reason: null,
              note: null,
              movement_id: null,
              entry_mode: "pack",
              entry_value: "3.400",
              entry_pack_conversion_id: "p1",
            },
          ],
        }),
      ),
    );
    const session = await clientGetCountSession(BUSINESS, "c1");
    expect(session.lines[0].entryMode).toBe("pack");
    expect(session.lines[0].entryValue).toBe(3.4);
    expect(session.lines[0].varianceQuantity).toBe(-420);
  });
});

describe("clientGetCostControl", () => {
  it("preserves the incompleteness markers and the disclosure", async () => {
    server.use(
      http.get(`/api/proxy/inventory/${BUSINESS}/cost-control`, () =>
        HttpResponse.json({
          valuation: {
            items: [],
            total_value: "120.50",
            currency_code: "EUR",
            items_without_cost: ["Mystery"],
            complete: false,
          },
          reorder_suggestions: [
            {
              item_id: "i1",
              item_name: "Tonic",
              base_unit: "each",
              suggested_quantity: "40.000",
              explanation: {
                par_quantity: "100.000",
                average_consumed_per_day: "2.000",
                lead_time_days: null,
                lead_time_cover: "0.000",
                target_quantity: "100.000",
                on_hand: "60.000",
                outstanding_on_order: "0.000",
                lookback_days: 28,
                formula: "par + (average consumed per day x lead time) - on hand - on order",
                lead_time_known: false,
              },
            },
          ],
          disclosure: "Operational cost estimates derived from stock movements; not accounting or fiscal records.",
        }),
      ),
    );
    const overview = await clientGetCostControl(BUSINESS);
    expect(overview.valuation.complete).toBe(false);
    expect(overview.valuation.itemsWithoutCost).toEqual(["Mystery"]);
    // A null lead time must stay null, never become 0 -- that is the difference
    // between "unknown" and "same day".
    expect(overview.reorderSuggestions[0].explanation.leadTimeDays).toBeNull();
    expect(overview.reorderSuggestions[0].explanation.leadTimeKnown).toBe(false);
    expect(overview.disclosure).toContain("not accounting or fiscal records");
  });
});
