import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    coverage: {
      provider: "v8",
      include: ["components/**/*.{ts,tsx}", "lib/**/*.ts", "app/**/*.{ts,tsx}"],
      reporter: ["text", "html", "lcov"],
    },
  },
});
