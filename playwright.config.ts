import "dotenv/config";
import { defineConfig } from "@playwright/test";

// End-to-end tests run the real app against the *_test database (wiped before each run).
// Uses the installed Google Chrome, so no browser download is needed.
const testDb = process.env.TEST_DATABASE_URL ?? "";
if (!/_test(\?|$)/.test(testDb)) throw new Error("TEST_DATABASE_URL must name a *_test database");

const PORT = 3200;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: "chrome",
    viewport: { width: 390, height: 844 }, // phone first
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    timeout: 180_000,
    reuseExistingServer: false,
    env: { DATABASE_URL: testDb, AUTH_DEV_LOGIN: "true" },
  },
});
