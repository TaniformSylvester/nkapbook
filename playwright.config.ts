import { defineConfig } from "@playwright/test";

// Small-phone checks (360px wide). Runs against `next start` on port 3100.
export default defineConfig({
  testDir: "tests/e2e",
  use: { baseURL: "http://localhost:3100", viewport: { width: 360, height: 740 }, deviceScaleFactor: 1 },
  webServer: { command: "npx next start -p 3100", port: 3100, reuseExistingServer: true, timeout: 60_000 },
});
