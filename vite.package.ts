/**
 * The one Vite+ configuration the eight published packages share: the task
 * graph (`check`, `build`, `docgen`, `test:unit`), the `vp pack` (tsdown)
 * settings and the vitest settings. Each `packages/<name>/vite.config.ts` is
 * a one-call instantiation of it (the shape effect-web uses).
 */
import { defineConfig } from "vite-plus";

/**
 * Input fingerprint for a package's cached tasks: auto tracking minus
 * node_modules bookkeeping churn (pnpm rewrites `.modules.yaml` on every
 * install), with the lockfile back explicitly so a dependency upgrade still
 * invalidates a type-check or a test run.
 */
const cacheInputs = [
  { auto: true },
  "!node_modules/**",
  { pattern: "!node_modules/**", base: "workspace" as const },
  { pattern: "pnpm-lock.yaml", base: "workspace" as const },
];

export const packageConfig = () =>
  defineConfig({
    run: {
      tasks: {
        // A provider type-checks against the core's own `check` first; the
        // core has no workspace dependency, so its edge is empty.
        check: {
          command: "tsc -p tsconfig.json",
          dependsOn: [{ task: "check", from: "dependencies" }],
          cache: { input: cacheInputs, output: [] },
        },
        // Emits `dist/` — one bundle per entry point plus its declarations —
        // with `vp pack` (tsdown). The `pack` block below is its
        // configuration; `effect` (a peer) and the workspace packages stay
        // external.
        build: {
          command: "vp pack",
          dependsOn: [{ task: "build", from: "dependencies" }],
          cache: { input: cacheInputs, output: ["dist/**"] },
        },
        // Type-checks (native `tsc` on PATH) AND executes every JSDoc
        // `@example` under `tsx`, generating the API docs under docs/
        // (gitignored). `docgen.json` beside each package's config is its
        // configuration. Uncached: it writes the example files it then reads
        // back.
        docgen: {
          command: "docgen",
          cache: false,
        },
        "test:unit": {
          command: "vp test run tests",
          cache: { env: ["VITEST_MAX_WORKERS", "NODE_OPTIONS"], input: cacheInputs, output: [] },
        },
      },
    },
    pack: {
      entry: ["src/index.ts"],
      platform: "neutral",
      dts: true,
      sourcemap: true,
    },
    test: {
      include: ["tests/**/*.test.ts"],
      testTimeout: 30_000,
      // CI's worker ceiling, read where vitest is configured; a build config,
      // not a branch in shipped source.
      // fallow-ignore-next-line test-only-branch
      maxWorkers: Number(process.env.VITEST_MAX_WORKERS ?? 2),
    },
  });
