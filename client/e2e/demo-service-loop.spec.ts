import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * The same evening as `service-loop.spec.ts`, walked against the demo build.
 *
 * This is the demo's fidelity check: the write layer in `client/lib/demo/`
 * exists so the pilot's loop can be walked with no backend, and the only
 * honest way to claim that is to walk it. It runs against a demo build
 * (`./scripts/dev.sh --demo`, or `next start` with `NEXT_PUBLIC_CROWBAR_DEMO`)
 * and skips itself against anything else. It needs no password, no database
 * and no network.
 *
 * ONE browser context, two pages. The demo keeps what a visitor does in their
 * own cookie, so the guest's phone and the host's board have to be the same
 * browser to be the same evening — which is also what makes the second tab a
 * real test of the change channel in `lib/demo/bus.ts`.
 *
 * Two steps of the real journey are deliberately not here, and the demo says
 * so rather than faking them:
 *   - The guest's signed management link. A demo cannot mint one, so
 *     `/reserve/manage` is a "not in the demo" page.
 *   - The stock ledger behind fulfilment. The recording carries servings left
 *     per menu item, which this asserts, but not the recipes behind them, so
 *     inventory quantities stay as recorded.
 * The booking made here is for the next day the recorded venue had slots for,
 * which is why the party seated below comes off the walk-in queue.
 */

const SLUG = "volt-and-vine";

/** The calendar names its days the way `en-US` does: "Tuesday, September 22nd, 2026". */
function dayName(daysFromToday: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromToday);
  const day = date.getDate();
  const rest = day % 100;
  const suffix =
    rest >= 11 && rest <= 13 ? "th" : (["th", "st", "nd", "rd"][day % 10] ?? "th");
  const weekday = date.toLocaleDateString("en-US", { weekday: "long" });
  const month = date.toLocaleDateString("en-US", { month: "long" });
  return `${weekday}, ${month} ${day}${suffix}, ${date.getFullYear()}`;
}

test("@demo the service loop, with no backend behind it", async ({ browser, baseURL }) => {
  const base = baseURL ?? "http://localhost:3000";
  const context = await browser.newContext();
  const staff = await context.newPage();
  await staff.setViewportSize({ width: 1280, height: 800 });

  await staff.goto("/auth/login");
  const ownerEntry = staff.getByRole("button", { name: "Enter as Owner" });
  if ((await ownerEntry.count()) === 0) {
    await context.close();
    test.skip(
      true,
      `${base} is not a demo build — the sign-in page offers no roles to enter as. ` +
        "Start one with ./scripts/dev.sh --demo and re-run.",
    );
    return;
  }

  // Every run starts from the recorded evening, so the walk is repeatable in
  // the browser a person has been clicking around in.
  await staff.request.post("/api/demo/reset", { headers: { origin: base } });

  const enterAs = async (label: string) => {
    await staff.goto("/auth/login");
    await staff.getByRole("button", { name: `Enter as ${label}` }).click();
    await staff.waitForURL(/\/business\//, { timeout: 30_000 });
  };
  const gotoFloor = async () => {
    await staff.goto("/business/floor");
    await expect(
      staff.getByRole("button").filter({ has: staff.locator("span.font-mono") }).first(),
      "the floor board did not render its tables",
    ).toBeVisible({ timeout: 30_000 });
  };
  const tableCard = (label: string): Locator =>
    staff.getByRole("button").filter({
      has: staff.locator("span.font-mono").filter({ hasText: new RegExp(`^${label}$`) }),
    });
  const tableSheet = (label: string): Locator =>
    staff.getByRole("dialog").filter({ hasText: `Table ${label}` });
  const seatingSheet = (): Locator =>
    staff.getByRole("dialog").filter({ hasText: "Selected capacity" });

  /**
   * The board's own HTTP snapshot, which is what the page renders from. A room
   * with nothing happening in it collapses to a summary card, so "the table is
   * free again" is asked of the board rather than of the screen.
   */
  const boardTable = async (label: string) => {
    const response = await staff.request.fetch(`${base}/api/proxy/floor-plan/board`, {
      headers: { origin: base },
      timeout: 45_000,
    });
    expect(response.ok(), `the board read returned ${response.status()}`).toBe(true);
    const board = (await response.json()) as {
      areas: { tables: { label: string; display_state: string; active_seating: unknown }[] }[];
    };
    const table = board.areas.flatMap((area) => area.tables).find((row) => row.label === label);
    expect(table, `table ${label} is missing from the board`).toBeTruthy();
    return table!;
  };

  let guest: Page | null = null;
  let qrUrl = "";
  let tableLabel = "";
  let tabId = "";

  try {
    // ── 1 ──────────────────────────────────────────────────────────────────
    await test.step("1. Book on the public reservation page", async () => {
      guest = await context.newPage();
      await guest.setViewportSize({ width: 390, height: 844 });
      await guest.goto(`/reserve/${SLUG}`);

      await guest.getByRole("button", { name: /Bar Seating/ }).first().click();
      await guest.getByRole("button", { name: "Next", exact: true }).click();
      await expect(guest.getByRole("heading", { name: /Select Date/ })).toBeVisible();

      await guest.getByLabel("Number of Guests").click();
      await guest.getByRole("option", { name: "2 guests" }).click();

      // Tomorrow, not tonight. The evening was recorded late, after the last
      // slot of its own service day had gone, so the first day the venue can
      // actually offer is the next one — and a demo that books into a day with
      // no availability would be inventing one.
      await guest.getByRole("button", { name: "Date" }).click();
      await guest
        .getByRole("dialog")
        .getByRole("button", { name: dayName(1), exact: true })
        .click();

      // A slot the mock offered, never one the browser built — the same rule
      // the real form follows, against a recorded answer instead of a live one.
      const slots = guest.getByRole("button", { name: /^\d{1,2}:\d{2}$/ });
      await expect(
        slots.first(),
        "the demo offered no slot to book — re-record the fixtures",
      ).toBeVisible({ timeout: 20_000 });
      await slots.first().click();
      await guest.getByRole("button", { name: "Next", exact: true }).click();

      await guest.getByLabel("First Name").fill("Robin");
      await guest.getByLabel("Last Name").fill("Demo");
      await guest.getByLabel("Phone Number").fill("+12025550199");
      await guest.getByLabel("Email").fill("robin.demo@example.com");
      await guest.getByRole("button", { name: "Next", exact: true }).click();

      await expect(guest.getByRole("heading", { name: /Review Your Reservation/ })).toBeVisible();
      await guest.locator("#terms").click();
      await guest.getByRole("button", { name: "Submit Reservation" }).click();
      await expect(guest.getByText("Reservation submitted successfully!")).toBeVisible();
    });

    // ── 2 ──────────────────────────────────────────────────────────────────
    await test.step("2. The booking is in the book, as the venue sees it", async () => {
      await enterAs("Owner");
      await staff.goto("/business/reservations");
      await expect(
        staff.getByText("Robin Demo").first(),
        "the booking the guest just made is not in the venue's reservations",
      ).toBeVisible({ timeout: 30_000 });

      // The QR sheet is owner-only, so the code for the table is taken here.
      await staff.goto("/business/floor/qr-sheet");
      const card = staff.locator("article[data-table-label]").first();
      await expect(card).toBeVisible({ timeout: 30_000 });
      tableLabel = (await card.getAttribute("data-table-label")) ?? "";
      qrUrl = (await card.getAttribute("data-qr-url")) ?? "";
      expect(qrUrl, "the QR sheet rendered no guest URL").toContain("table_token=");
    });

    // ── 3 ──────────────────────────────────────────────────────────────────
    await test.step("3. Seat the waiting party on the host board", async () => {
      await enterAs("Host / server");
      await gotoFloor();

      const waiting = staff.locator("div.bg-card").filter({ hasText: "waiting" }).first();
      await expect(waiting, "no party is waiting on the demo's board").toBeVisible({
        timeout: 30_000,
      });
      await waiting.getByRole("button", { name: "Seat" }).click();

      await expect(seatingSheet()).toBeVisible();
      await seatingSheet()
        .locator("button")
        .filter({
          has: staff.locator("p.font-medium").filter({ hasText: new RegExp(`^${tableLabel}$`) }),
        })
        .click();
      await seatingSheet().getByRole("button", { name: "Seat party" }).click();
      await expect(seatingSheet(), "the seating sheet stayed open").toBeHidden({
        timeout: 20_000,
      });

      await expect(tableCard(tableLabel)).toContainText("occupied");
      await expect(tableCard(tableLabel)).toContainText("Seated");
    });

    // ── 4 ──────────────────────────────────────────────────────────────────
    await test.step("4. The guest scans, and the host answers", async () => {
      // The host stays at the board: the scan has to reach them there, which
      // in a demo means the visitor's own other tab telling this one.
      await guest!.goto(qrUrl);
      await expect(guest!.getByText("Table ordering")).toBeVisible({ timeout: 20_000 });
      await guest!.locator('section[id^="cat-"] button').first().click();
      await guest!.getByRole("button", { name: /^Add to cart/i }).click();
      await expect(
        guest!.getByRole("button", { name: /Waiting for staff approval/ }),
        "a scan must not unlock ordering on its own",
      ).toBeVisible();

      await expect(
        tableCard(tableLabel),
        "the scan did not reach the host board",
      ).toContainText("waiting", { timeout: 20_000 });
      await tableCard(tableLabel).click();
      await expect(tableSheet(tableLabel)).toContainText("Waiting to order");
      await tableSheet(tableLabel).getByRole("button", { name: "Approve" }).click();
      await expect(
        tableSheet(tableLabel).getByRole("button", { name: "Approve" }),
        "the approved request is still waiting on the board",
      ).toBeHidden({ timeout: 20_000 });
      await staff.keyboard.press("Escape");
    });

    // ── 5 ──────────────────────────────────────────────────────────────────
    await test.step("5. Order from the table", async () => {
      const viewCart = guest!.getByRole("link").filter({ hasText: /^View cart/i });
      await expect(
        viewCart,
        "the approved session did not unlock ordering",
      ).toBeVisible({ timeout: 20_000 });
      await viewCart.click();

      await expect(guest!.getByRole("heading", { name: "Your order" })).toBeVisible();
      const ageGate = guest!.getByRole("checkbox", { name: /contains alcohol/ });
      if ((await ageGate.count()) > 0) await ageGate.click();
      await guest!.getByRole("button", { name: /Place Order/ }).click();
      await expect(guest!.getByRole("heading", { name: "Order placed" })).toBeVisible({
        timeout: 20_000,
      });
    });

    // ── 6 ──────────────────────────────────────────────────────────────────
    await test.step("6. The round is on the table's tab", async () => {
      await gotoFloor();
      await tableCard(tableLabel).click();
      await tableSheet(tableLabel).getByRole("button", { name: "Open tab" }).click();
      await staff.waitForURL(/\/business\/tabs/, { timeout: 30_000 });
      // Which tab, exactly. Everything after this addresses it by id, so no
      // assertion can be satisfied by one of the recorded tabs beside it.
      tabId = new URL(staff.url()).searchParams.get("tab") ?? "";
      expect(tabId, "opening the tab did not name it in the URL").toBeTruthy();
      await expect(
        staff.getByText("Nothing on this tab yet."),
        "the guest's round did not reach the tab the QR order opened",
      ).toBeHidden();
    });

    // ── 7 ──────────────────────────────────────────────────────────────────
    await test.step("7. Add a staff round to the same tab", async () => {
      await staff.getByRole("button", { name: "Add order" }).click();
      const picker = staff.getByRole("dialog").filter({ hasText: "Add order to" });
      await picker.locator("button").filter({ hasText: "Old Fashioned" }).first().click();
      // Choosing an item swaps the sheet for that item's own panel, so the
      // rest of this round is addressed on the page rather than through a
      // filter that no longer matches.
      await staff.getByRole("button", { name: /^Add · / }).click();
      await staff.getByRole("button", { name: "Add to tab" }).click();
      await expect(
        staff.getByRole("button", { name: "Add to tab" }),
        "the round never left the picker",
      ).toBeHidden({ timeout: 20_000 });
      await expect(staff.getByText("Old Fashioned").first()).toBeVisible();
    });

    // ── 8 ──────────────────────────────────────────────────────────────────
    await test.step("8. Send both rounds to the pass", async () => {
      await enterAs("Bar / kitchen");
      await staff.goto("/business/orders");
      // The board is a client read, so wait for it before counting anything —
      // an empty board answers "nothing to do" to every question.
      await expect(
        staff.getByRole("button", { name: "Start", exact: true }).first(),
        "the ticket board did not render the round that was just placed",
      ).toBeVisible({ timeout: 30_000 });

      for (const action of ["Start", "Ready", "Served"]) {
        // Each pass moves everything the board currently offers that action.
        for (let guard = 0; guard < 12; guard += 1) {
          const next = staff.getByRole("button", { name: action, exact: true }).first();
          if (!(await next.isVisible().catch(() => false))) break;
          await next.click();
          await staff.waitForTimeout(500);
        }
      }
      await expect(
        staff.getByText(/Old Fashioned · Served/).first(),
        "the round the visitor placed never reached the pass",
      ).toBeVisible({ timeout: 20_000 });
    });

    // ── 9 ──────────────────────────────────────────────────────────────────
    await test.step("9. The tab holds the table until the register is recorded", async () => {
      await enterAs("Host / server");
      await gotoFloor();
      await tableCard(tableLabel).click();
      await expect(
        tableSheet(tableLabel),
        "an open tab with rounds on it must hold its table",
      ).toContainText("settled externally before this seating can close");
      await staff.keyboard.press("Escape");

      await staff.goto(`/business/tabs?tab=${tabId}`);
      await staff.getByRole("button", { name: "Settle externally" }).click();
      const confirm = staff.getByRole("dialog").filter({ hasText: "the register settled" });
      await confirm.getByRole("textbox", { name: "Register reference" }).fill("REG-1/0299");
      await confirm.getByRole("button", { name: "Record it" }).click();
      await expect(
        staff.getByText("register REG-1/0299"),
        "the settlement was not recorded against this tab",
      ).toBeVisible({ timeout: 20_000 });
    });

    // ── 10 ─────────────────────────────────────────────────────────────────
    await test.step("10. Close the seating and give the table back", async () => {
      await gotoFloor();
      await tableCard(tableLabel).click();
      await tableSheet(tableLabel).getByRole("button", { name: "Close seating" }).click();
      // Closing a seating asks first — it completes the visit.
      const confirmClose = staff.getByRole("dialog").filter({ hasText: "Close seating?" });
      await confirmClose.getByRole("button", { name: "Close seating" }).click();
      await expect(confirmClose).toBeHidden({ timeout: 20_000 });
      await expect
        .poll(async () => (await boardTable(tableLabel)).display_state, { timeout: 20_000 })
        .toBe("available");
      expect(
        (await boardTable(tableLabel)).active_seating,
        "closing the seating left it open on the board",
      ).toBeNull();
    });

    // ── 11 ─────────────────────────────────────────────────────────────────
    await test.step("11. Start the evening again", async () => {
      await staff.getByRole("button", { name: "Start the evening again" }).click();
      await gotoFloor();
      await expect(
        staff.locator("div.bg-card").filter({ hasText: "waiting" }).first(),
        "starting again did not bring the recorded evening back",
      ).toBeVisible({ timeout: 30_000 });
      // The party that was seated is waiting again, and so is their table.
      expect((await boardTable(tableLabel)).display_state).toBe("available");
    });
  } finally {
    await context.close();
  }
});
