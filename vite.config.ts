/**
 * @copyright Thomas Foster
 *
 * Root workspace config. Owns the repo-wide format/lint/staged passes (read
 * statically by `vp fmt` / `vp lint` / `vp staged`) and the root `check`
 * aggregate over every package's type gate.
 *
 * Copied from the effect-drizzle-ext library (itself a copy of the
 * gardeneria application's root config): every comment that explains a
 * load-bearing decision is part of the standard and travels with the config.
 */

import { defineConfig } from "vite-plus";
import { recommended } from "@effect/tsgo/oxlint-presets";
import effect from "@enfect/oxlint";

export default defineConfig({
  // Staged-file checks run by `vp staged` (pre-commit).
  staged: {
    "*.{js,ts,css,json,md}": "vp check --fix",
  },
  fmt: {
    // docgen's output (the generated API docs and the example files it
    // type-checks and runs) is gitignored and not ours to format.
    ignorePatterns: ["packages/*/docs/**", "**/coverage/**"],
    overrides: [
      {
        files: ["**/*.md"],
        options: {
          proseWrap: "never",
        },
      },
    ],
  },
  lint: {
    ignorePatterns: ["packages/*/docs/**", "**/coverage/**"],
    extends: [recommended, effect.configs.recommended],
    plugins: ["typescript", "unicorn", "oxc", "import", "promise", "vitest", "jsdoc"],
    categories: {
      correctness: "error",
      suspicious: "error",
      perf: "error",
    },
    rules: {
      "eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      "eslint/prefer-const": "warn",
      // `_tag` is Effect's discriminant on every tagged union and error.
      "eslint/no-underscore-dangle": ["error", { allow: ["_tag"] }],
      // `casting-awareness` is an awareness prompt, not a defect rule — it
      // fires on every `as`, including the narrowings a `fetch` stub's
      // `RequestInit` structurally requires in the test suites. Stays visible
      // as a warning.
      "effect/casting-awareness": "warn",
      // Hard-codes abbreviations (`Arr`, `P`, `R`, …) with no options, so it is
      // unsatisfiable under the full-name convention (`import * as Option from
      // "effect/Option"`) this library shares with its consumers.
      "effect/prefer-namespace-imports": "off",
      // Flags every `effect/http/*` import as unstable. HTTP through
      // `effect/http` is this library's contract (every provider is an
      // `HttpClient` consumer, AGENTS.md), so each import site would warn.
      "effecttsgo/unstable-api-usage": "off",
      "typescript/no-explicit-any": "off",
      "typescript/no-empty-object-type": "off",
      "typescript/ban-ts-comment": "off",
      "unicorn/no-empty-file": "off",
      "vite-plus/prefer-vite-plus-imports": "error",
    },
    overrides: [
      // Test suites ARE the runtime boundary: `Effect.runPromise` in a test
      // body is the harness running the effect under test, and a bare
      // `new Error("boom")` there is a fixture standing in for whatever a
      // vendor SDK or the platform would have thrown.
      {
        files: ["**/tests/**/*.ts"],
        rules: {
          "effect/effect-run-in-body": "off",
          "effect/avoid-untagged-errors": "off",
          // A captured request mirrors the wire: "no body" is `undefined`
          // there, exactly as `RequestInit.body` has it.
          "effect/prefer-option-over-null": "off",
          // A test body IS the entry point that provides the layers under
          // test, which is exactly the place this rule says `Effect.provide`
          // belongs.
          "effecttsgo/strict-effect-provide": "off",
        },
      },
      // The exact type-equality idiom (`(<T>() => T extends A ? 1 : 2) extends
      // …`) needs the phantom `T` this rule reports; there is no equivalent
      // without it. Only the compile-time assertion suites use it.
      {
        files: ["packages/alchemy/tests/alchemy.test.ts", "tests/dist-consumer/src/consumer.ts"],
        rules: {
          "typescript/no-unnecessary-type-parameters": "off",
        },
      },
      // `deploy` maps a generic bindings record to `Deployed<B>`; `Record.map`
      // loses the per-key types, so the result is asserted back (with a
      // SAFETY comment). 2 sites, both in that helper.
      {
        files: ["packages/alchemy/tests/alchemy.test.ts"],
        rules: {
          "typescript/no-unsafe-type-assertion": "warn",
        },
      },
      // Build/test configs are evaluated by Vite and Vitest in bare Node,
      // before any Effect runtime exists — there is no `Config` provider to
      // read from, so `process.env` is the only thing that works there
      // (vite.package.ts's `VITEST_MAX_WORKERS`).
      {
        files: ["**/vite.config.ts", "**/vitest.config.ts", "vite.package.ts"],
        rules: {
          "effect/avoid-process-env": "off",
        },
      },
    ],
    // Type-aware linting through the oxlint-tsgolint vite-plus carries
    // (patched by `effect-tsgo patch --oxlint`, so `@effect/tsgo`'s preset
    // rules run here too). `typeCheck` also reports TypeScript errors in the
    // lint pass; the `check` tasks (native tsc, Effect-patched) stay the type
    // gate, and on this tree the two agree (no lint-only type errors).
    options: {
      typeAware: true,
      typeCheck: true,
    },
    jsPlugins: [
      {
        name: "vite-plus",
        specifier: "vite-plus/oxlint-plugin",
      },
    ],
  },
  run: {
    tasks: {
      // The CI typecheck gate, as one task: every package's `check`, the
      // dist-consumer check that type-checks a consumer fixture against the
      // EMITTED declarations, and every package's `docgen` (which type-checks
      // and runs each JSDoc `@example`). A pure graph node.
      check: {
        command: "echo 'check: every type gate green'",
        dependsOn: [
          "@thomasfosterau/effect-connect#check",
          "@thomasfosterau/effect-connect-sendgrid#check",
          "@thomasfosterau/effect-connect-resend#check",
          "@thomasfosterau/effect-connect-twilio#check",
          "@thomasfosterau/effect-connect-vonage#check",
          "@thomasfosterau/effect-connect-slack#check",
          "@thomasfosterau/effect-connect-discord#check",
          "@thomasfosterau/effect-connect-alchemy#check",
          "@effect-connect/dist-consumer#check",
          "@thomasfosterau/effect-connect#docgen",
          "@thomasfosterau/effect-connect-sendgrid#docgen",
          "@thomasfosterau/effect-connect-resend#docgen",
          "@thomasfosterau/effect-connect-twilio#docgen",
          "@thomasfosterau/effect-connect-vonage#docgen",
          "@thomasfosterau/effect-connect-slack#docgen",
          "@thomasfosterau/effect-connect-discord#docgen",
          "@thomasfosterau/effect-connect-alchemy#docgen",
        ],
        cache: false,
      },
      // Every package's unit suite under one Istanbul coverage map
      // (`coverage/coverage-final.json`), which `fallow audit` reads for exact
      // per-function CRAP scores (`health.coverage` in .fallowrc.json).
      // Without it fallow estimates every function as uncovered, and any
      // function with cyclomatic complexity >= 5 fails the gate on its own.
      // Run this before `fallow audit` (the PreToolUse fallow gate runs the
      // audit on `git commit` / `git push` but never refreshes this map).
      // The suites import their siblings through `exports`, which point at
      // `src/` inside the workspace, so no build edge is needed.
      "test:coverage": {
        command: "vp test run --coverage",
        cache: false,
      },
    },
  },
  test: {
    // One entry per package: each package's own vite.config.ts is a vitest
    // project, so the root run and the root coverage map cover them all.
    projects: ["packages/*/vite.config.ts"],
    coverage: {
      provider: "istanbul",
      reporter: ["text-summary", "json-summary", "json"],
      reportsDirectory: "./coverage",
      include: ["packages/*/src/**/*.ts"],
      exclude: ["**/*.d.ts"],
    },
  },
});
