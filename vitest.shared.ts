import { defaultClientConditions, defaultServerConditions } from "vite"

/**
 * Workspace packages export their TypeScript source under this private condition, so tests, typechecks
 * and the dev server need no build step. It is deliberately not "development": Vite enables that one by
 * default, which would make published packages resolve to raw .ts in consumers' node_modules.
 */
export const SOURCE_CONDITION = "dose-bench-source"

export const sourceResolve = {
  resolve: { conditions: [SOURCE_CONDITION, ...defaultClientConditions] },
  ssr: { resolve: { conditions: [SOURCE_CONDITION, ...defaultServerConditions] } },
}
