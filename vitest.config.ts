import { defineConfig } from "vitest/config";
import { sourceResolve } from "./vitest.shared";

export default defineConfig({
  ...sourceResolve,
  test: {
    projects: ["packages/*", "apps/cli", "integrations/qualtrics"],
    passWithNoTests: true,
  },
});
