import { defineConfig, devices } from "@playwright/test";

// E2E_BASE_URL lets this run against any environment (local dev, staging,
// a Vercel preview) without code changes -- see docs/STAGING.md and the
// "test:e2e" npm script. Deliberately NOT run in CI on every push (see
// .github/workflows/e2e.yml, which is workflow_dispatch-only): these tests
// hit a real deployed app with a real test account, not a mocked/local stack.
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,
  retries: 1,
  reporter: "list",
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
