import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { render, screen, waitFor } from "@testing-library/react";
import { Bitmap } from "@paulmillr/qr";
import { decodeQR } from "@paulmillr/qr/decode.js";

import { server } from "../mocks/handlers";
import { clientListFloorPlanTableQrs } from "@/lib/client-api";
import QrSheetClient from "@/app/business/floor/qr-sheet/qr-sheet-client";

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const SHEET = {
  business_id: "biz-1",
  business_name: "Volt & Vine",
  areas: [
    {
      id: "area-1",
      name: "Bar Counter",
      tables: [
        {
          table_id: "table-1",
          label: "B1",
          revision: 3,
          url: "/menu/volt-and-vine#table_token=v2.tok-b1.sig",
        },
        {
          table_id: "table-2",
          label: "B2",
          revision: 1,
          url: "/menu/volt-and-vine#table_token=v2.tok-b2.sig",
        },
      ],
    },
  ],
};

function mockSheet() {
  server.use(
    http.get("/api/proxy/floor-plan/tables/qr", () => HttpResponse.json(SHEET)),
  );
}

/**
 * Rebuild the module matrix from the `<path>` the component actually rendered.
 *
 * This is the point of the test: it reads the geometry that would be printed,
 * not the value that was passed in. `table-qr-code.tsx` emits one subpath per
 * horizontal run of dark modules, `M{x} {y}h{w}v1h-{w}z`, and this reverses
 * exactly that.
 */
function matrixFromRenderedSvg(svg: SVGSVGElement): boolean[][] {
  const size = Number(svg.getAttribute("viewBox")!.split(" ")[3]);
  const matrix = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => false),
  );

  const d = svg.querySelector("path")!.getAttribute("d")!;
  for (const [, x, y, run] of d.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) {
    for (let i = 0; i < Number(run); i += 1) {
      matrix[Number(y)][Number(x) + i] = true;
    }
  }
  return matrix;
}

describe("the table QR sheet endpoint", () => {
  it("maps the sheet to camelCase and leaks no snake_case keys", async () => {
    mockSheet();

    const sheet = await clientListFloorPlanTableQrs();

    expect(sheet.businessName).toBe("Volt & Vine");
    expect(sheet).not.toHaveProperty("business_name");
    expect(sheet.areas[0].tables[0]).toEqual({
      tableId: "table-1",
      label: "B1",
      revision: 3,
      url: "/menu/volt-and-vine#table_token=v2.tok-b1.sig",
    });
    expect(sheet.areas[0].tables[0]).not.toHaveProperty("table_id");
  });
});

describe("the printed card", () => {
  it("encodes exactly the absolute URL the API returned for that table", async () => {
    mockSheet();
    render(<QrSheetClient />);

    const card = await screen.findByLabelText("Ordering code for table B1");
    const article = card.closest("article")!;

    // The string the renderer was handed, asserted against the API's own
    // relative URL resolved the one way the product resolves it.
    const expected = new URL(
      SHEET.areas[0].tables[0].url,
      window.location.origin,
    ).toString();

    expect(article.getAttribute("data-qr-url")).toBe(expected);
    expect(expected).toBe(
      `${window.location.origin}/menu/volt-and-vine#table_token=v2.tok-b1.sig`,
    );
  });

  it("renders a code that decodes back to that URL", async () => {
    mockSheet();
    render(<QrSheetClient />);

    const svg = (await screen.findByLabelText(
      "Ordering code for table B1",
    )) as unknown as SVGSVGElement;
    const expected = svg.closest("article")!.getAttribute("data-qr-url")!;

    const matrix = matrixFromRenderedSvg(svg);
    const image = new Bitmap(
      { width: matrix.length, height: matrix.length },
      matrix,
    )
      // A quiet zone the decoder can find the finder patterns in, then enough
      // pixels per module for it to sample cleanly. Neither changes the code.
      .border(4, false)
      .scale(4)
      .toImage();

    expect(decodeQR(image)).toBe(expected);
  });

  it("shows the label prominently and the revision, so two cards can be told apart", async () => {
    mockSheet();
    render(<QrSheetClient />);

    expect(await screen.findByText("B1")).toBeInTheDocument();
    expect(screen.getByText("rev 3")).toBeInTheDocument();
    expect(screen.getByText("rev 1")).toBeInTheDocument();
  });

  it("says nothing about tables when the venue has none", async () => {
    server.use(
      http.get("/api/proxy/floor-plan/tables/qr", () =>
        HttpResponse.json({ ...SHEET, areas: [] }),
      ),
    );
    render(<QrSheetClient />);

    await waitFor(() =>
      expect(screen.getByText("There are no tables to print")).toBeInTheDocument(),
    );
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("offers a retry and rotates nothing when the read fails", async () => {
    server.use(
      http.get("/api/proxy/floor-plan/tables/qr", () =>
        HttpResponse.json({ code: "SERVER_ERROR", message: "nope" }, { status: 500 }),
      ),
    );
    render(<QrSheetClient />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/could not be loaded/i);
    expect(alert).toHaveTextContent(/no\s+code was rotated/i);
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
