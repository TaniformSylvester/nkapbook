import { defineConfig } from "vitest/config";

// Security (RLS) tests. Needs a local Postgres; see tests/db/README.md.
export default defineConfig({
  test: {
    include: ["tests/db/**/*.test.ts"],
    globalSetup: ["tests/db/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 60000,
  },
});
