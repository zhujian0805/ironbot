import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"]
  },
  coverage: {
    provider: "v8",
    reporter: ["text", "json", "html", "lcov"],
    include: ["src/**/*.ts"],
    exclude: ["src/**/*.d.ts", "src/**/*.test.ts", "src/cli/**"],
    reportsDirectory: "./coverage",
    thresholds: {
      global: {
        branches: 70,
        functions: 80,
        lines: 80,
        statements: 80
      }
    }
  }
});
