import { defineConfig } from "vite-plus";

/**
 * Input fingerprint for this package's cached tasks: auto tracking minus
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

export default defineConfig({
  run: {
    tasks: {
      check: {
        command: "tsc -p tsconfig.json",
        input: cacheInputs,
        output: [],
      },
      // Emits `dist/` — one bundle per entry point plus its declarations —
      // with `vp pack` (tsdown). The `pack` block below is its configuration;
      // `effect` (a peer) and the workspace packages stay external.
      build: {
        command: "vp pack",
        input: cacheInputs,
        output: ["dist/**"],
      },
      "test:unit": {
        command: "vp test run tests",
        env: ["VITEST_MAX_WORKERS", "NODE_OPTIONS"],
        input: cacheInputs,
        output: [],
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
    maxWorkers: Number(process.env.VITEST_MAX_WORKERS ?? 2),
  },
});
