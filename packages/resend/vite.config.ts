import { defineConfig } from "vite-plus";

/** Same fingerprint shape and rationale as packages/core/vite.config.ts. */
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
        dependsOn: [{ task: "check", from: "dependencies" }],
        input: cacheInputs,
        output: [],
      },
      build: {
        command: "vp pack",
        dependsOn: [{ task: "build", from: "dependencies" }],
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
