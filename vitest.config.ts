import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { conditions: ["development"] },
  test: {
    projects: ["packages/*", "apps/cli"],
    passWithNoTests: true,
  },
});
