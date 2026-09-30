import { defineConfig } from "vitest/config";

// API-route-focused test setup: Node environment (no jsdom/React Testing
// Library) since these test route handlers directly, not rendered
// components. See DEPLOYMENT.md's Testing section for what's covered and why.
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/app/api/**/*.ts"],
    },
  },
});
