import { defineProject } from "vitest/config";
import { sourceResolve } from "../../vitest.shared";

export default defineProject({
  ...sourceResolve,
  test: { name: "models", environment: "node" },
});
