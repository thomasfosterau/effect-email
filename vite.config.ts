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
import effect from "@mpsuesser/oxlint-plugin-effect";

export default defineConfig({
  // Staged-file checks run by `vp staged` (pre-commit).
  staged: {
    "*.{js,ts,css,json,md}": "vp check --fix",
  },
  fmt: {
    // docgen's output (the generated API docs and the example files it
    // type-checks and runs) is gitignored and not ours to format.
    ignorePatterns: ["packages/*/docs/**"],
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
    ignorePatterns: ["packages/*/docs/**"],
    extends: [recommended, effect.configs.recommended],
    categories: {
      correctness: "error",
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
      // `casting-awareness` is an awareness prompt, not a defect rule — it
      // fires on every `as`, including the narrowings a `fetch` stub's
      // `RequestInit` structurally requires in the test suites. Stays visible
      // as a warning.
      "effect/casting-awareness": "warn",
      // Hard-codes abbreviations (`Arr`, `P`, `R`, …) with no options, so it is
      // unsatisfiable under the full-name convention (`import * as Option from
      // "effect/Option"`) this library shares with its consumers.
      "effect/prefer-namespace-imports": "off",
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
        },
      },
      // Build/test configs are evaluated by Vite and Vitest in bare Node,
      // before any Effect runtime exists — there is no `Config` provider to
      // read from, so `process.env` is the only thing that works there.
      {
        files: ["**/vite.config.ts", "**/vitest.config.ts"],
        rules: {
          "effect/avoid-node-imports": "off",
          "effect/avoid-sync-fs": "off",
          "effect/avoid-process-env": "off",
          "effect/use-console-service": "off",
          "effect/use-filesystem-service": "off",
          "effect/use-path-service": "off",
          "effect/avoid-native-fetch": "off",
          "effect/effect-promise-vs-trypromise": "off",
        },
      },
    ],
    // Type-aware linting is intentionally disabled: type checking stays the
    // `check` tasks' job (native tsc, Effect-patched).
    options: {
      typeAware: false,
      typeCheck: false,
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
          "@thomasfosterau/effect-email#check",
          "@thomasfosterau/effect-email-sendgrid#check",
          "@thomasfosterau/effect-email-resend#check",
          "@effect-email/dist-consumer#check",
          "@thomasfosterau/effect-email#docgen",
          "@thomasfosterau/effect-email-sendgrid#docgen",
          "@thomasfosterau/effect-email-resend#docgen",
        ],
        cache: false,
      },
    },
  },
});
