import { defineConfig, devices } from "@playwright/test";

/**
 * The service-loop journey runs against a stack that is already up and already
 * seeded. There is deliberately no `webServer` block: starting servers, running
 * migrations or seeding would make the test mutate the developer's environment
 * to suit itself, and seeding in particular replaces the demo tenant. The spec
 * fails immediately with instructions when nothing is listening.
 *
 * One worker and no retries, because the journey is a single ordered walk over
 * shared operational data — a second copy of it running concurrently would be
 * competing for the same tables, and a retry would replay half-finished state.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  // The whole eleven-step walk, not one action.
  timeout: 5 * 60 * 1000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: process.env.JOURNEY_BASE_URL ?? "http://localhost:3000",
    // Without these an action waits forever, so a selector pointing at nothing
    // burns the whole test timeout and the report blames the teardown line
    // instead of the click. A journey whose failure you cannot read is not a
    // test, so every action fails fast and names itself.
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    // Nothing is captured to disk: artifact collection is a later pass, and a
    // test that litters the working tree is a test people stop running.
    trace: "off",
    video: "off",
    screenshot: "off",
  },
  // Chromium only. One browser is the pilot's reality; three is a matrix
  // nobody reads. Viewports are set per context in the spec, because the guest
  // half of the journey happens on a phone and the staff half does not.
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
