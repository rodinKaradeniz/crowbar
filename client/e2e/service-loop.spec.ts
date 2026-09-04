import { expect, test, type Locator } from "@playwright/test";

/**
 * The pilot service loop, walked end to end in a browser.
 *
 * This is the journey `.claude/skills/run-crowbar-service-loop/SKILL.md`
 * defines, in its order, with its proofs. It is deliberately ONE test made of
 * eleven `test.step()` calls rather than eleven tests: the steps share the
 * reservation, the table, the seating and the tab, and eleven tests that must
 * run in order would be a lie about what they are.
 *
 * It runs against a stack that is already up and already seeded. It starts no
 * servers, applies no migrations and seeds nothing — seeding replaces the demo
 * tenant, and that is the user's authorized mutation, not a step a test takes
 * to make itself convenient.
 *
 * It must pass repeatedly against the same database, so: it books under a name
 * unique to the run, it asks the board which table is free instead of assuming
 * one, every stock assertion is a delta measured across the run, and it closes
 * what it opens.
 */

const BUSINESS_SLUG = "volt-and-vine";
const OWNER_EMAIL = "owner@example.com";
const SERVICE_TYPE = "Bar Seating";
const PARTY_SIZE = 2;

type BoardParty = { source_id: string; name: string };
type BoardTable = {
  id: string;
  label: string;
  display_state: string;
  active_seating: { seating_id: string; open_tab_id: string | null } | null;
  active_assignment: BoardParty | null;
  next_reservation: BoardParty | null;
};
type Board = {
  areas: { tables: BoardTable[] }[];
};
type GuestSession = {
  id: string;
  table_id: string;
  seating_id: string;
  status: string;
  created_at: string;
};
type InventoryItem = { id: string; name: string; current_quantity: number };
type StockMovement = {
  id: string;
  item_id: string;
  movement_type: string;
  quantity_delta: number;
};

test("the pilot service loop, from booking to guest and cost history", async ({
  browser,
  baseURL,
  request,
}) => {
  // No default, no literal, no fallback: the seeded password is the operator's
  // to supply, and a test that carries one would put it in a tracked file.
  const demoPassword = process.env.DEMO_ADMIN_PASSWORD;
  if (!demoPassword) {
    throw new Error(
      "DEMO_ADMIN_PASSWORD is not set. Export the password the demo tenant was " +
        "seeded with, then re-run: DEMO_ADMIN_PASSWORD=... npm run test:journey",
    );
  }

  const base = baseURL ?? "http://localhost:3000";
  try {
    await request.get(base, { timeout: 10_000 });
  } catch {
    throw new Error(
      `Nothing is answering on ${base}. This journey needs a running, seeded ` +
        "stack: start it with ./scripts/dev.sh and re-run.",
    );
  }

  // Separate contexts, so the guest never carries a staff session. The guest
  // half of this journey happens on a phone and the staff half does not.
  const guestContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const staffContext = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const guest = await guestContext.newPage();
  const staff = await staffContext.newPage();

  const runId = Date.now().toString(36);
  const guestName = `Journey ${runId}`;
  const guestEmail = `journey-${runId}@example.com`;
  // Every line this run orders carries the run id as its special request.
  // The ticket board cannot be found by table: order.table_identifier is a
  // legacy column nothing in the running product sets, so a ticket's
  // "Table N" header renders only for rows the seed wrote directly. The note
  // is a real product field and it is what makes this run's tickets findable.
  const journeyTag = `journey ${runId}`;
  // A German mobile: the server parses the number against the venue's own
  // country, so a US-shaped number is rejected even though the seed holds some.
  const guestPhone = `+49151${String(Date.now()).slice(-8)}`;

  // Staff API access reuses the signed-in page's cookie. The BFF proxy refuses
  // a mutation whose Origin is not its own, so send one.
  const api = (method: string, path: string, body?: unknown) =>
    staff.request.fetch(`${base}/api/proxy/${path}`, {
      method,
      headers: { origin: base, "content-type": "application/json" },
      data: body === undefined ? undefined : JSON.stringify(body),
      // Its own budget, not the UI action timeout: the floor board is a slow
      // read (measured at 1.5-5s against a seed-sized database, through a dev
      // server with SQL echo on) and a read that is merely slow should not be
      // reported as a broken step.
      timeout: 45_000,
    });
  const apiJson = async <T>(path: string): Promise<T> => {
    const response = await api("GET", path);
    expect(response.ok(), `GET ${path} returned ${response.status()}`).toBe(true);
    return (await response.json()) as T;
  };

  const boardTables = async (): Promise<BoardTable[]> => {
    const board = await apiJson<Board>("floor-plan/board");
    return board.areas.flatMap((area) => area.tables);
  };
  const boardTable = async (id: string): Promise<BoardTable> => {
    const found = (await boardTables()).find((table) => table.id === id);
    expect(found, `table ${id} is missing from the board snapshot`).toBeTruthy();
    return found as BoardTable;
  };

  // Whichever table card carries this label, matched on the label element so
  // "T1" can never select "T10".
  const tableCard = (label: string): Locator =>
    staff.getByRole("button").filter({
      has: staff.locator("span.font-mono").filter({ hasText: new RegExp(`^${label}$`) }),
    });
  // The board behind this page is a slow read, so every visit waits for the
  // room to actually be on screen before a table is looked for.
  const gotoFloor = async () => {
    await staff.goto("/business/floor");
    await expect(
      staff.getByRole("button").filter({ has: staff.locator("span.font-mono") }).first(),
      "the floor board did not render its tables",
    ).toBeVisible({ timeout: 45_000 });
  };
  // The seating sheet is the only dialog that carries a capacity readout, which
  // separates it from the table detail sheet that opens it.
  const seatingSheet = (): Locator =>
    staff.getByRole("dialog").filter({ hasText: "Selected capacity" });
  const sheetTableButton = (label: string): Locator =>
    seatingSheet()
      .locator("button")
      .filter({
        has: staff.locator("p.font-medium").filter({ hasText: new RegExp(`^${label}$`) }),
      });

  let tableId = "";
  let tableLabel = "";
  let reservationId = "";
  let seatingId = "";
  let tabId = "";
  let qrUrl = "";
  let stockBefore = new Map<string, { quantity: number; movementIds: Set<string> }>();
  const orderIds: string[] = [];

  try {
    // ── Sign in, and take the stock baseline before anything is ordered ──────
    await staff.goto("/auth/login");
    await staff.getByLabel("Email").fill(OWNER_EMAIL);
    await staff.getByLabel("Password").fill(demoPassword);
    await staff.getByRole("button", { name: "Sign in" }).click();
    await staff.waitForURL(/\/business\//, { timeout: 30_000 });

    const session = await (await staff.request.get(`${base}/api/auth/session`)).json();
    expect(
      session?.type,
      `${OWNER_EMAIL} did not sign in as staff — is DEMO_ADMIN_PASSWORD the value this database was seeded with?`,
    ).toBe("staff");
    const businessId = session.businessId as string;

    const movementsFor = (itemId: string) =>
      apiJson<StockMovement[]>(`inventory/${businessId}/items/${itemId}/movements`);
    // Quantity AND the ledger, per item. A stock movement carries no order
    // attribution on the wire — the orders_id column exists in the database but
    // is not on StockMovementResponse, and reference_type/reference_id are null
    // for a sale — so "this run's movements" can only mean "movement ids that
    // were not there before". Taken here because step 8 measures across
    // everything steps 5-7 do.
    const stockSnapshot = async () => {
      const items = await apiJson<InventoryItem[]>(`inventory/${businessId}/items`);
      const snapshot = new Map<string, { quantity: number; movementIds: Set<string> }>();
      for (const item of items) {
        snapshot.set(item.id, {
          quantity: Number(item.current_quantity),
          movementIds: new Set((await movementsFor(item.id)).map((movement) => movement.id)),
        });
      }
      return snapshot;
    };
    stockBefore = await stockSnapshot();

    // ── 1 ────────────────────────────────────────────────────────────────────
    await test.step("1. Book on the public reservation page", async () => {
      await guest.goto(`/reserve/${BUSINESS_SLUG}`);
      await guest
        .getByRole("button", { name: new RegExp(SERVICE_TYPE) })
        .first()
        .click();
      await expect(guest.getByRole("heading", { name: /Select Date/ })).toBeVisible();

      await guest.getByLabel("Number of Guests").click();
      await guest.getByRole("option", { name: `${PARTY_SIZE} guests` }).click();

      // The form submits an absolute timestamp the server returned, never one
      // the browser built, so the slot has to come from the offered list.
      const slots = guest.getByRole("button", { name: /^\d{1,2}:\d{2}$/ });
      await expect(
        slots.first(),
        "No slot was offered for today. This journey books on the current " +
          "service day, so it cannot run in the hours after the venue closes " +
          "and before the next service day begins.",
      ).toBeVisible({ timeout: 20_000 });
      await slots.first().click();
      await guest.getByRole("button", { name: "Continue" }).click();

      await guest.getByLabel("First Name").fill("Journey");
      await guest.getByLabel("Last Name").fill(runId);
      await guest.getByLabel("Phone Number").fill(guestPhone);
      await guest.getByLabel("Email").fill(guestEmail);
      await guest.getByRole("button", { name: "Continue" }).click();

      await expect(guest.getByRole("heading", { name: /Review Your Reservation/ })).toBeVisible();
      await guest.locator("#terms").click();
      await guest.getByRole("button", { name: "Submit Reservation" }).click();
      await expect(guest.getByText("Reservation submitted successfully!")).toBeVisible();
    });

    // ── 2 ────────────────────────────────────────────────────────────────────
    await test.step("2. Manage the booking as the guest", async () => {
      // The booking response set the reservation capability cookie on this
      // context, so the guest reaches the manage page without the emailed link.
      await guest.goto("/reserve/manage");
      await expect(guest.getByRole("heading", { name: "Manage your booking" })).toBeVisible();
      await expect(guest.getByText(new RegExp(`${PARTY_SIZE} guests`))).toBeVisible();

      await guest.getByRole("button", { name: /still coming/ }).click();
      // Reconfirming does not revoke the link the guest is holding.
      await expect(guest.getByText(/reconfirmed/)).toBeVisible();
    });

    // ── 3 ────────────────────────────────────────────────────────────────────
    await test.step("3. Assign the booking to a table on the host board", async () => {
      await gotoFloor();

      // Ask the board which table is free, rather than assuming a number. A
      // table that already carries a later booking is excluded: overlapping
      // plans on one table are refused, and this run must not depend on what
      // the seed or an earlier run left behind.
      const free = (await boardTables()).filter(
        (table) => table.display_state === "available" && table.next_reservation === null,
      );
      expect(
        free.length,
        "the board offers no unplanned, available table to seat this party on",
      ).toBeGreaterThan(0);
      tableId = free[0].id;
      tableLabel = free[0].label;

      const party = staff.locator("div.bg-card").filter({ hasText: guestName });
      await expect(
        party,
        `"${guestName}" is not among today's arrivals on the host board`,
      ).toBeVisible({ timeout: 20_000 });
      await party.getByRole("button", { name: "Assign" }).click();

      await expect(seatingSheet()).toBeVisible();
      await sheetTableButton(tableLabel).click();
      await seatingSheet().getByRole("button", { name: "Assign tables" }).click();
      await expect(
        seatingSheet(),
        `the assign sheet stayed open, so ${tableLabel} refused the plan`,
      ).toBeHidden();

      // An assignment is planning, not occupancy: the table carries the booking
      // but stays available for a walk-in until the party is actually seated.
      // (The board only calls a table "reserved" once the booking's own time has
      // arrived; before that the plan rides on next_reservation.)
      const planned = await boardTable(tableId);
      expect(
        planned.display_state,
        "a planned table must still be offerable to a walk-in",
      ).toBe("available");
      expect(planned.active_seating, "an assignment must not open a seating").toBeNull();
      expect(planned.next_reservation?.name).toBe(guestName);
      reservationId = planned.next_reservation!.source_id;
      await expect(tableCard(tableLabel)).toContainText(guestName);
    });

    // ── 4 ────────────────────────────────────────────────────────────────────
    await test.step("4. Seat the party onto the planned table", async () => {
      // The floor UI cannot seat THIS party right now, and that is the product
      // being coherent rather than broken: a host assigns in advance and seats
      // on arrival. Once assigned, the booking leaves "Unassigned arrivals" (so
      // it is no longer in the table sheet's pick list), and the sheet only
      // offers "Seat party" once the booking's own time has arrived. This
      // journey compresses an evening into a minute, so it opens the seating
      // through the endpoint the sheet itself calls. Reported, not worked
      // around silently.
      const opened = await api("POST", "floor-plan/seatings", {
        source_type: "reservation",
        source_id: reservationId,
        table_ids: [tableId],
      });
      expect(opened.ok(), `opening the seating returned ${opened.status()}`).toBe(true);
      seatingId = (await opened.json()).id as string;

      // The board's HTTP snapshot is the proof; the socket only invalidates.
      await expect
        .poll(async () => (await boardTable(tableId)).display_state, { timeout: 20_000 })
        .toBe("occupied");
      expect((await boardTable(tableId)).active_seating?.seating_id).toBe(seatingId);

      await gotoFloor();
      await expect(tableCard(tableLabel)).toContainText("occupied");
      await expect(tableCard(tableLabel)).toContainText("Seated");
    });

    // ── 5 ────────────────────────────────────────────────────────────────────
    await test.step("5. Order from the table QR as the guest", async () => {
      await staff.goto("/business/floor/qr-sheet");
      const card = staff.locator(`article[data-table-label="${tableLabel}"]`);
      await expect(card).toBeVisible();
      qrUrl = (await card.getAttribute("data-qr-url")) ?? "";
      expect(qrUrl, "the QR sheet did not render a guest URL for this table").toContain(
        "table_token=",
      );

      // The scan is bootstrapped in an effect that React StrictMode invokes
      // twice in dev. The first pass strips the fragment and creates the
      // session; the second pass, now fragment-less, asks for the "current"
      // session, 404s because the created cookie has not landed yet, and its
      // handler clears the state the first pass was about to set. So: wait for
      // the session to actually be created, then reload, which resolves it from
      // the cookie. Dev-only — a production build does not double-invoke — but
      // reported rather than hidden.
      const sessionCreated = guest.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          response.url().includes("/table-sessions"),
      );
      await guest.goto(qrUrl);
      await sessionCreated;
      await guest.reload();
      await expect(guest.getByText("Table ordering")).toBeVisible({ timeout: 20_000 });

      const addFirstItemToCart = async () => {
        await guest.locator('section[id^="cat-"] button').first().click();
        await guest.getByRole("dialog").getByPlaceholder(/^E\.g\./).fill(journeyTag);
        await guest.getByRole("button", { name: /Add to Cart/ }).click();
      };
      await addFirstItemToCart();

      // A scan opens a PENDING session that staff must approve. No staff surface
      // exists for that decision — the endpoints ship, the UI does not — so the
      // approval is driven through the API the missing screen would have called.
      await expect(guest.getByRole("button", { name: /Waiting for staff approval/ })).toBeVisible();
      const pending = await apiJson<GuestSession[]>(
        "floor-plan/table-guest-sessions?status=pending",
      );
      // Matched on the seating, not the table: a table outlives its seatings,
      // and an abandoned pending session from an earlier party on the same
      // table would otherwise be the one approved.
      const mine = pending
        .filter((entry) => entry.seating_id === seatingId)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
      expect(
        mine,
        "the QR scan did not create a pending table session on this seating",
      ).toBeTruthy();
      const approved = await api("POST", `floor-plan/table-guest-sessions/${mine!.id}/approve`);
      expect(approved.ok(), `approving the table session returned ${approved.status()}`).toBe(true);

      // Reload rather than waiting on the page's own poll for the decision.
      // That poll is one-shot-fatal: its failure handler sets the session state
      // to null, which makes its own effect bail out and clears the interval,
      // so a single transient read failure strands the guest on "Scan your
      // table QR to order" forever. Reloading reads the decision from the
      // cookie. The cart lives in React state only — it is written to
      // sessionStorage on the View Cart click — so the reload empties it and
      // the round has to be built again.
      await guest.reload();
      await addFirstItemToCart();
      const viewCart = guest.getByRole("link").filter({ hasText: /View Cart/ });
      await expect(
        viewCart,
        "the approved table session did not unlock ordering",
      ).toBeVisible({ timeout: 20_000 });
      await viewCart.click();

      await expect(guest.getByRole("heading", { name: "Your order" })).toBeVisible();
      // Most of the always-on menu is alcohol, and an alcoholic cart will not
      // submit until the guest confirms their age. Tick it when it is asked
      // for, which is what the guest in front of the phone does.
      const ageGate = guest.getByRole("checkbox", { name: /contains alcohol/ });
      if ((await ageGate.count()) > 0) {
        await ageGate.click();
      }
      await guest.getByRole("button", { name: /Place Order/ }).click();
      await expect(guest.getByRole("heading", { name: "Order placed" })).toBeVisible({
        timeout: 20_000,
      });

      // The round joined the seating's single open tab.
      await expect
        .poll(async () => (await boardTable(tableId)).active_seating?.open_tab_id ?? null, {
          timeout: 20_000,
        })
        .not.toBeNull();
      tabId = (await boardTable(tableId)).active_seating!.open_tab_id!;

      // Rotating the credential must retire the one already in the wild.
      await gotoFloor();
      await tableCard(tableLabel).click();
      const detail = staff.getByRole("dialog").filter({ hasText: `Table ${tableLabel}` });
      await detail.getByText("Guest QR code").click();
      await detail.getByRole("button", { name: "Rotate" }).click();
      const rotateConfirm = staff
        .getByRole("dialog")
        .filter({ hasText: "Rotate this table QR code?" });
      await rotateConfirm.getByRole("button", { name: "Rotate the code" }).click();
      await expect(staff.getByText(/no longer works/)).toBeVisible({ timeout: 20_000 });

      const staleScan = await guestContext.newPage();
      await staleScan.goto(qrUrl);
      await expect(staleScan.getByText("Table ordering")).toBeHidden({ timeout: 20_000 });
      await staleScan.close();
      await staff.keyboard.press("Escape");
    });

    // ── 6 ────────────────────────────────────────────────────────────────────
    await test.step("6. Add a staff round to the same tab", async () => {
      await gotoFloor();
      await tableCard(tableLabel).click();
      const detail = staff.getByRole("dialog").filter({ hasText: `Table ${tableLabel}` });
      await detail.getByRole("button", { name: "Open tab" }).click();
      await staff.waitForURL(/\/business\/tabs/, { timeout: 30_000 });

      await staff.getByRole("button", { name: "Add order" }).click();
      // Held without a title filter on purpose: the compose dialog renames
      // itself to the item once you open one, so a title-matched locator would
      // stop resolving exactly when the item step needs it.
      const compose = staff.getByRole("dialog");
      await expect(compose).toContainText("Add order to Tab");
      await compose.locator("button").filter({ hasText: /€/ }).first().click();
      await compose.getByPlaceholder(/^E\.g\./).fill(journeyTag);
      await compose.getByRole("button", { name: /^Add ·/ }).click();
      await compose.getByRole("button", { name: "Add to tab" }).click();
      await expect(compose).toBeHidden({ timeout: 20_000 });

      // Both rounds, one tab, one total.
      const tab = await apiJson<{ orders: { id: string }[]; total: number; status: string }>(
        `tabs/${tabId}`,
      );
      expect(tab.orders.length, "the guest and staff rounds are not on one tab").toBe(2);
      expect(tab.status).toBe("open");
      expect(tab.total).toBeGreaterThan(0);
      orderIds.push(...tab.orders.map((order) => order.id));
    });

    // ── 7 ────────────────────────────────────────────────────────────────────
    await test.step("7. Fulfill both rounds to served", async () => {
      await staff.goto("/business/orders");
      const ticket = staff.locator("article").filter({ hasText: journeyTag });
      await expect(
        ticket.first(),
        "this run's tickets are not on the board",
      ).toBeVisible({ timeout: 20_000 });

      // A ticket is redistributed across the status columns as its own lines
      // move, so no DOM count is a per-click progress signal: advancing a line
      // turns its "Start" into a "Ready" somewhere else and the total is
      // unchanged. The server's own line statuses are the signal, so each click
      // is confirmed before the next one is made.
      const forward = () =>
        staff
          .locator("article")
          .filter({ hasText: journeyTag })
          .getByRole("button", { name: /^(Start|Ready|Served)$/ });
      const lineSignature = async () => {
        const tab = await apiJson<{
          orders: { id: string; line_items: { id: string; line_status: string }[] }[];
        }>(`tabs/${tabId}`);
        return tab.orders
          .filter((order) => orderIds.includes(order.id))
          .flatMap((order) => order.line_items.map((line) => `${line.id}:${line.line_status}`))
          .sort()
          .join(",");
      };
      const allServed = (signature: string) =>
        signature.length > 0 &&
        signature.split(",").every((entry) => entry.endsWith(":served"));

      for (let guard = 0; guard < 16; guard += 1) {
        const before = await lineSignature();
        if (allServed(before)) break;
        const buttons = forward();
        if ((await buttons.count()) === 0) {
          // Every line is mid-flight between columns; wait for the board to land
          // rather than burning the guard in microseconds.
          await expect(buttons).not.toHaveCount(0, { timeout: 5_000 }).catch(() => undefined);
          continue;
        }
        // The button can detach mid-click when a socket update lands. Either
        // way the next pass re-reads the truth and retries.
        await buttons.first().click().catch(() => undefined);
        await expect
          .poll(lineSignature, { timeout: 6_000 })
          .not.toBe(before)
          .catch(() => undefined);
      }

      expect(
        allServed(await lineSignature()),
        "not every line of this run's two rounds reached served",
      ).toBe(true);
      // And the board itself shows them served, with nothing left to advance.
      await expect(forward()).toHaveCount(0);
    });

    // ── 8 ────────────────────────────────────────────────────────────────────
    await test.step("8. Reconcile the stock the fulfilment deducted", async () => {
      const itemsAfter = await apiJson<InventoryItem[]>(`inventory/${businessId}/items`);
      const moved: string[] = [];
      const explained: string[] = [];
      let deducted: { id: string; name: string; quantity: number } | null = null;

      for (const item of itemsAfter) {
        const before = stockBefore.get(item.id);
        const quantityBefore = Number(before?.quantity ?? 0);
        const quantityAfter = Number(item.current_quantity);
        if (quantityAfter !== quantityBefore) moved.push(item.id);

        const fresh = (await movementsFor(item.id)).filter(
          (movement) => !before?.movementIds.has(movement.id),
        );
        if (fresh.length === 0) continue;
        explained.push(item.id);
        // The invariant that holds whatever was ordered: the ledger accounts
        // for the quantity change exactly.
        expect(
          quantityAfter - quantityBefore,
          `the ledger and the quantity disagree for ${item.name}`,
        ).toBeCloseTo(
          fresh.reduce((total, movement) => total + Number(movement.quantity_delta), 0),
          3,
        );
        if (fresh.some((movement) => movement.movement_type === "sale")) {
          deducted = { id: item.id, name: item.name, quantity: quantityAfter };
        }
      }

      // Two-way: nothing moved without a movement, and no movement without a
      // move. On a fresh seed the only recipe-backed item sits on the windowed
      // Happy Hour menu, so outside 17:00-20:00 Europe/Berlin both sides are
      // legitimately empty and this asserts that nothing moved unbidden.
      expect(
        explained.sort(),
        "an item moved without a stock movement to explain it, or the other way round",
      ).toEqual(moved.sort());

      if (!deducted) return;

      // A reversal is built from the movements this order actually recorded,
      // never from re-reading the recipe.
      const ticket = staff.locator("article").filter({ hasText: journeyTag });
      await ticket.getByRole("button", { name: /^Move .* back$/ }).first().click();
      await expect
        .poll(
          async () =>
            (await movementsFor(deducted.id)).filter(
              (movement) => movement.movement_type === "sale_reversal",
            ).length,
          { timeout: 20_000 },
        )
        .toBeGreaterThan(0);
      await expect
        .poll(
          async () => {
            const items = await apiJson<InventoryItem[]>(`inventory/${businessId}/items`);
            return Number(items.find((item) => item.id === deducted.id)?.current_quantity);
          },
          { timeout: 20_000 },
        )
        .toBeGreaterThan(deducted.quantity);

      // Put it back, so the run ends where it would have without this check.
      await ticket.getByRole("button", { name: "Served", exact: true }).first().click();
      await expect
        .poll(
          async () => {
            const items = await apiJson<InventoryItem[]>(`inventory/${businessId}/items`);
            return Number(items.find((item) => item.id === deducted.id)?.current_quantity);
          },
          { timeout: 20_000 },
        )
        .toBeCloseTo(deducted.quantity, 3);
    });

    // ── 9 ────────────────────────────────────────────────────────────────────
    await test.step("9. Record that the register settled the tab externally", async () => {
      // Asserted here rather than in step 10 because it is only true while the
      // tab is open: a seating with an open tab must refuse to close.
      const refused = await api("POST", `floor-plan/seatings/${seatingId}/close`);
      expect(
        refused.ok(),
        "a seating with an open tab was allowed to close",
      ).toBe(false);

      await staff.goto(`/business/tabs?tab=${tabId}`);
      await staff.getByRole("button", { name: "Settle externally" }).click();
      const dialog = staff
        .getByRole("dialog")
        .filter({ hasText: /Record that the register settled/ });
      await expect(dialog).toBeVisible();
      await dialog.locator("#register-reference").fill(`journey-${runId}`);
      await dialog.getByRole("button", { name: "Record it" }).click();
      await expect(dialog).toBeHidden({ timeout: 20_000 });

      await expect(staff.getByText("Tab total")).toBeVisible({ timeout: 20_000 });
      const settled = await apiJson<{ status: string }>(`tabs/${tabId}`);
      expect(settled.status).toBe("settled_externally");

      // Crowbar records an assertion about the venue's own register. It does not
      // take payment, and nothing on this surface may say that it did.
      const body = (await staff.locator("body").innerText()).toLowerCase();
      expect(body).toContain("settled externally");
      expect(body).not.toMatch(/\bpaid\b|payment processed|\brevenue\b/);
    });

    // ── 10 ───────────────────────────────────────────────────────────────────
    await test.step("10. Close the seating and return the tables to ready", async () => {
      await gotoFloor();
      await tableCard(tableLabel).click();
      const detail = staff.getByRole("dialog").filter({ hasText: `Table ${tableLabel}` });
      await detail.getByRole("button", { name: "Close seating" }).click();
      const confirm = staff.getByRole("dialog").filter({ hasText: "Close seating?" });
      await confirm.getByRole("button", { name: "Close seating" }).click();

      await expect
        .poll(async () => (await boardTable(tableId)).display_state, { timeout: 20_000 })
        .toBe("available");
      expect((await boardTable(tableId)).active_seating).toBeNull();
    });

    // ── 11 ───────────────────────────────────────────────────────────────────
    await test.step("11. Inspect the guest timeline and the cost side", async () => {
      await staff.goto("/business/customers");
      await staff.getByPlaceholder(/Search by name/).fill(guestName);
      const row = staff.locator("tr").filter({ hasText: guestName });
      await expect(row, `${guestName} is not in the guest list`).toBeVisible({ timeout: 20_000 });
      await row.getByRole("link", { name: "Profile" }).click();

      await expect(staff.getByRole("heading", { name: "Guest timeline" })).toBeVisible({
        timeout: 20_000,
      });
      const timeline = staff.locator("section").filter({ hasText: "Guest timeline" });
      await expect(timeline).toContainText("Reservation");
      await expect(timeline).toContainText("Settled externally");

      // The cost side: the stock surface the ledger feeds.
      await staff.goto("/business/inventory");
      await expect(staff.getByRole("heading", { name: "Stock", exact: true })).toBeVisible({
        timeout: 20_000,
      });
      await expect(staff.getByText(/par:/).first()).toBeVisible();
    });
  } finally {
    await guestContext.close();
    await staffContext.close();
  }
});
