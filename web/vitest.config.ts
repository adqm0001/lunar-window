import { defineConfig } from "vitest/config";

// Tests cover pure modules in src/lib only (no WebGL, no DOM), so they run in plain Node.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    passWithNoTests: true,
  },
});
