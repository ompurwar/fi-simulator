import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globals: true,
    // Backend tests boot a real in-memory MongoDB per suite; give them room.
    testTimeout: 30000,
    hookTimeout: 30000,
    // mongodb-memory-server downloads a binary on first run — do not cache in CI temp.
    pool: "forks",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@server": path.resolve(__dirname, "src/server"),
    },
  },
});
