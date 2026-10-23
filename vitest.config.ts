import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts", "content/**/*.test.ts", "apps/web/src/**/*.test.ts"],
  },
});
