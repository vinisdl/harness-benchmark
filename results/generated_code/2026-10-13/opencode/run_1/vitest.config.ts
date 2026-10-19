import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: [
        "lib/**/*.ts",
        "components/**/*.tsx",
        "app/**/*.tsx",
        "app/api/**/*.ts",
      ],
      exclude: ["lib/schema.ts"],
      thresholds: { statements: 85, branches: 75, functions: 85, lines: 85 },
    },
  },
});
