/**
 * Records the demo's fixtures from a real, seeded local stack.
 *
 *   DEMO_ADMIN_PASSWORD='<the seeded value>' node scripts/record-demo-fixtures.mjs
 *
 * Needs: the API on :8000 (`./scripts/dev.sh`, seeded with SEED_DATA=true — the
 * seed already contains tonight's service), and nothing on :8100 or :3100. It
 * starts nothing else, seeds nothing, and READS ONLY: every write the walk
 * provokes is refused by the recording proxy before it reaches the API.
 *
 * How: a recording proxy sits in front of the API; a production build of this
 * frontend is started against the proxy and walked in Chromium, once per demo
 * role and once as a signed-out guest. Every read the frontend makes — from the
 * browser and from the server — is written to `lib/demo/fixtures/recording.json`.
 * Recorded, not hand-written, so the mock speaks the API's real contract;
 * `server/tests/test_demo_fixture_contract.py` fails when the API moves on, and
 * re-running this is the fix.
 *
 * The recording is refused if it holds anything `lib/demo/fixture-rules.mjs`
 * forbids: non-fictional contact details, a known password, or payment and
 * revenue language.
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { openSync, writeFileSync } from "node:fs";
import os from "node:os";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

import { findFixtureViolations, scrubNonFictionalPhones } from "../lib/demo/fixture-rules.mjs";

const CLIENT_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(CLIENT_ROOT, "lib", "demo", "fixtures", "recording.json");

const API_URL = (process.env.CROWBAR_API_URL || "http://localhost:8000").replace(/\/+$/, "");
const PROXY_PORT = 8100;
const WEB_PORT = 3100;
const WEB = `http://localhost:${WEB_PORT}`;
const SLUG = "volt-and-vine";
const PASSWORD = process.env.DEMO_ADMIN_PASSWORD;
const WEB_LOG = path.join(os.tmpdir(), "crowbar-demo-recording-web.log");
const WEB_LOG_FD = openSync(WEB_LOG, "w");

/** Seeded demo accounts. Keep in step with `lib/demo/token.ts` DEMO_ROLES. */
const ROLES = {
  owner: { email: "owner@example.com", userId: "00000000-0000-0000-0002-000000000010" },
  host_server: { email: "host@example.com", userId: "00000000-0000-0000-0002-000000000012" },
  bar_kitchen: { email: "bar@example.com", userId: "00000000-0000-0000-0002-000000000013" },
};

/** In-scope workspace routes. Out-of-scope ones are `lib/demo/scope.ts`. */
const WORKSPACE_ROUTES = [
  "/business/overview",
  "/business/reservations",
  "/business/schedule",
  "/business/floor",
  "/business/floor/qr-sheet",
  "/business/orders",
  "/business/tabs",
  "/business/queue",
  "/business/inventory",
  "/business/customers",
  "/business/reports",
  "/business/insights",
  "/business/menu",
  "/business/staff",
  "/business/docs",
];

const PUBLIC_ROUTES = [`/reserve/${SLUG}`, `/menu/${SLUG}`, `/order/${SLUG}`, `/queue/${SLUG}`];

/** How many days ahead the booking pages may ask about. */
const BOOKING_DAYS_AHEAD = 14;

function fail(message) {
  console.error(`record-demo-fixtures: ${message}`);
  process.exit(1);
}

function audienceFor(authorization) {
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
  if (!token) return "public";
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    const match = Object.entries(ROLES).find(([, role]) => role.userId === payload.sub);
    return match ? match[0] : null;
  } catch {
    return null;
  }
}

function requestKey(method, pathname, query) {
  // Mirrors `lib/demo/recording.ts` requestKey.
  const sorted = [...query.entries()].sort(([a, av], [b, bv]) =>
    a === b ? av.localeCompare(bv) : a.localeCompare(b),
  );
  const search = new URLSearchParams(sorted).toString();
  return `${method.toUpperCase()} ${pathname}${search ? `?${search}` : ""}`;
}

// ─── Recording proxy ──────────────────────────────────────────────────────────

const bodies = {};
const responses = {};
const refusedWrites = new Set();

function record(audience, key, status, text) {
  let body;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      return; // not JSON — nothing the mock could replay
    }
  }
  let hash;
  if (body !== undefined) {
    hash = createHash("sha256").update(JSON.stringify(body)).digest("hex").slice(0, 16);
    bodies[hash] = body;
  }
  responses[audience] ??= {};
  responses[audience][key] = hash === undefined ? { status } : { status, body: hash };
}

function startProxy() {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, API_URL);
    const method = req.method.toUpperCase();

    if (method !== "GET" && method !== "HEAD") {
      // Read-only by construction. Sign-in is the one write the walk needs,
      // and it changes nothing the demo shows.
      if (!(method === "POST" && url.pathname === "/api/auth/login")) {
        refusedWrites.add(`${method} ${url.pathname}`);
        req.resume();
        res.writeHead(409, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ code: "RECORDING_READ_ONLY", message: "Recording is read-only.", details: null }));
        return;
      }
    }

    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const headers = { ...req.headers };
    delete headers.host;
    delete headers["accept-encoding"];

    let upstream;
    try {
      upstream = await fetch(url, {
        method,
        headers,
        body: chunks.length ? Buffer.concat(chunks) : undefined,
        redirect: "manual",
      });
    } catch (error) {
      res.writeHead(502);
      res.end(String(error));
      return;
    }
    const text = await upstream.text();

    const audience = audienceFor(req.headers.authorization);
    const recordable =
      method === "GET" &&
      audience !== null &&
      url.pathname.startsWith("/api/") &&
      // The demo never shows an ML result; the mock answers these itself.
      !url.pathname.startsWith("/api/insights/") &&
      upstream.status !== 401 &&
      upstream.status < 500;
    if (recordable) {
      record(audience, requestKey(method, url.pathname, url.searchParams), upstream.status, text);
    }

    const outHeaders = {};
    upstream.headers.forEach((value, name) => {
      if (!["content-encoding", "content-length", "transfer-encoding", "connection"].includes(name)) {
        outHeaders[name] = value;
      }
    });
    res.writeHead(upstream.status, outHeaders);
    res.end(text);
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(PROXY_PORT, () => resolve(server));
  });
}

// ─── Frontend under recording ─────────────────────────────────────────────────

function run(command, args, env, { background = false } = {}) {
  const child = spawn(command, args, {
    cwd: CLIENT_ROOT,
    env: { ...process.env, ...env },
    stdio: background ? ["ignore", WEB_LOG_FD, WEB_LOG_FD] : "inherit",
    detached: background,
  });
  if (background) return child;
  return new Promise((resolve, reject) => {
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${command} ${args.join(" ")} exited ${code}`))));
  });
}

async function waitFor(url, seconds) {
  for (let i = 0; i < seconds; i += 1) {
    try {
      const response = await fetch(url);
      if (response.status < 500) return;
    } catch {
      /* not up yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  fail(`${url} did not come up`);
}

/** Load a page and give its client-side reads time to finish. */
async function visit(page, route) {
  if (web?.exitCode !== null && web?.exitCode !== undefined) {
    fail(`the frontend under recording exited (${web.exitCode}); see ${WEB_LOG}`);
  }
  await page.goto(`${WEB}${route}`, { waitUntil: "load", timeout: 60_000 });
  await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
  await page.waitForTimeout(1_500);
  console.log(`  ${route} → ${page.url().replace(WEB, "")}`);
}

/** Click every ARIA tab on the page, so reads behind each one are recorded. */
async function clickEveryTab(page) {
  const tabs = page.getByRole("tab");
  const count = await tabs.count();
  for (let i = 0; i < count; i += 1) {
    await tabs.nth(i).click({ timeout: 3_000 }).catch(() => {});
    await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
    await page.waitForTimeout(800);
  }
}

/** Reads that only happen once a visitor opens something. */
async function explore(page) {
  for (const route of WORKSPACE_ROUTES) {
    await visit(page, route);
    await clickEveryTab(page);
  }

  // Reports: every section for every preset range.
  await visit(page, "/business/reports");
  for (const preset of ["Today", "Last 7 days", "Last 28 days", "Last 90 days"]) {
    await page.getByRole("button", { name: preset, exact: true }).click({ timeout: 3_000 }).catch(() => {});
    await page.waitForTimeout(800);
    await clickEveryTab(page);
  }

  // Inventory: each item's movement ledger.
  await visit(page, "/business/inventory");
  const histories = page.locator('button[title="View history"]');
  const count = await histories.count();
  for (let i = 0; i < count; i += 1) {
    await histories.nth(i).click({ timeout: 3_000 }).catch(() => {});
    await page.waitForTimeout(700);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  }
}

/** Follow up to `limit` in-page links that match, so detail reads are recorded. */
async function followLinks(page, from, selector, limit) {
  await visit(page, from);
  const hrefs = await page.locator(selector).evaluateAll(
    (anchors, max) => [...new Set(anchors.map((a) => a.getAttribute("href")))].slice(0, max),
    limit,
  );
  for (const href of hrefs) await visit(page, href);
}

/**
 * Availability is asked per booking type, day and party size — too many
 * combinations to click through. Ask for exactly what the booking form asks
 * for, through the same proxy, for the days a guest could plausibly pick.
 */
async function recordAvailability() {
  console.log("Recording availability");
  const proxy = `http://localhost:${PROXY_PORT}`;
  const business = await (await fetch(`${proxy}/api/businesses/slug/${SLUG}`)).json();
  const serviceTypes = await (await fetch(`${proxy}/api/service-types/business/${business.id}`)).json();
  const today = new Date();
  for (const serviceType of serviceTypes) {
    const maxGuests = Math.min(business.max_guests ?? 10, serviceType.capacity ?? business.max_guests ?? 10);
    for (let offset = 0; offset < BOOKING_DAYS_AHEAD; offset += 1) {
      const day = new Date(today.getTime() + offset * 86_400_000);
      const startDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(day);
      for (let guests = 1; guests <= maxGuests; guests += 1) {
        const query = new URLSearchParams({
          service_type_id: serviceType.id,
          start_date: startDate,
          days: "1",
          guests: String(guests),
        });
        await fetch(`${proxy}/api/availability/business/${business.id}?${query}`);
      }
    }
  }
}

async function walkAsRole(browser, role) {
  console.log(`Walking as ${role}`);
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const login = await page.request.post(`${WEB}/api/auth/login`, {
    data: { email: ROLES[role].email, password: PASSWORD },
    headers: { Origin: WEB },
  });
  if (!login.ok()) fail(`sign-in as ${role} failed (${login.status()}) — is DEMO_ADMIN_PASSWORD the seeded value?`);

  await explore(page);
  await followLinks(page, "/business/customers", "a[href^='/business/customers/']", 3);
  await followLinks(page, "/business/docs", "a[href^='/business/docs/']", 40);
  await context.close();
}

async function walkAsGuest(browser) {
  console.log("Walking as a signed-out guest");
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  for (const route of PUBLIC_ROUTES) await visit(page, route);
  await context.close();
}

// ─── Main ─────────────────────────────────────────────────────────────────────

let web;

async function main() {
  if (!PASSWORD) fail("set DEMO_ADMIN_PASSWORD to the value the demo tenant was seeded with.");

  const business = await fetch(`${API_URL}/api/businesses/slug/${SLUG}`).catch(() => null);
  if (!business?.ok) fail(`the API at ${API_URL} is not serving the seeded ${SLUG} tenant.`);

  const recordedAt = new Date().toISOString();
  const proxy = await startProxy();
  const proxyUrl = `http://localhost:${PROXY_PORT}`;
  const env = {
    API_INTERNAL_URL: proxyUrl,
    NEXT_PUBLIC_API_URL: proxyUrl,
    NEXT_PUBLIC_CROWBAR_DEMO: "",
    NEXT_DIST_DIR: undefined,
  };

  try {
    console.log("Building the frontend against the recording proxy…");
    await run("npx", ["next", "build"], env);
    web = run("npx", ["next", "start", "-p", String(WEB_PORT)], env, { background: true });
    web.on("exit", (code, signal) => console.log(`  (frontend under recording exited: code=${code} signal=${signal})`));
    await waitFor(`${WEB}/api/health`, 60);

    const browser = await chromium.launch();
    try {
      for (const role of Object.keys(ROLES)) await walkAsRole(browser, role);
      await walkAsGuest(browser);
      await recordAvailability();
    } finally {
      await browser.close();
    }
  } finally {
    if (web?.pid) {
      try {
        process.kill(-web.pid, "SIGTERM");
      } catch {
        /* already gone */
      }
    }
    proxy.close();
  }

  const recording = { recordedAt, bodies: scrubNonFictionalPhones(bodies), responses };
  const problems = findFixtureViolations(recording);
  if (problems.length) {
    console.error(problems.slice(0, 50).join("\n"));
    fail(`refusing to write: ${problems.length} fixture rule violation(s).`);
  }

  writeFileSync(OUT, `${JSON.stringify(recording, null, 1)}\n`);
  const counts = Object.entries(responses).map(([audience, map]) => `${audience} ${Object.keys(map).length}`);
  console.log(`Wrote ${path.relative(CLIENT_ROOT, OUT)}: ${Object.keys(bodies).length} bodies; ${counts.join(", ")}`);
  if (refusedWrites.size) {
    console.log(`Writes the walk attempted (refused, not recorded):\n  ${[...refusedWrites].sort().join("\n  ")}`);
  }
}

await main();
