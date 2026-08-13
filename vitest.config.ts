import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Integration tests share one SQLite file, so they must not run in
    // parallel processes that would race on the same rows.
    pool: "threads",
    poolOptions: { threads: { singleThread: true } },
    setupFiles: ["tests/setup.ts"],
  },
});
