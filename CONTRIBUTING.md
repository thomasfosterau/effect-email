# Contributing

Maintained by Thomas Foster, with a workflow meant to be approachable for both humans and coding agents. Conventions are in [AGENTS.md](AGENTS.md).

## Setup

`pnpm install` (pnpm 11, pinned by `packageManager`) installs dependencies, the Vite+ git hooks and the Effect-patched `tsc` / `oxlint` (the root `prepare` script). Branching, changesets and the PR rules are in [AGENTS.md](AGENTS.md#branches-and-pull-requests): squash-merge with a conventional prefix (`feat:`, `fix:`, `docs:`, `chore:`).

## Git hooks

Hooks are managed by Vite+; the editable [.vite-hooks/pre-commit](.vite-hooks/pre-commit) is committed. **pre-commit** runs `vp staged` (format + lint on staged files). There is no pre-push hook.

## CI expectations

[ci.yml](.github/workflows/ci.yml) runs one job: steps 1–5 of the gates in [AGENTS.md → Verification](AGENTS.md#verification) (the last is `pnpm audit --audit-level high`). Step 6, the fallow audit, is local-only (the PreToolUse hook and the pre-PR checklist). [release.yml](.github/workflows/release.yml) runs changesets/action on `main`: it opens the "Version Packages" PR while unreleased changesets exist and publishes the packages once it merges, via npm trusted publishing (OIDC) — see [PUBLISHING.md](PUBLISHING.md).

## Pre-PR checklist

1. Run the gates in [AGENTS.md → Verification](AGENTS.md#verification) and note each result in the PR.
2. A changeset (`pnpm changeset`) for every change to a published package's behaviour.
3. `git fetch origin main && git rebase origin/main`.
4. Docs: the package `README.md` for any exported change; the package `CLAUDE.md` for a new term or invariant.

## Running individual checks

```sh
vp check --fix                           # format + lint, autofix
vp run check                             # the whole type gate (includes building dist/ and docgen)
vp run --filter ./packages/core check    # one package's type check
vp run -r test:unit                      # unit tests
vp test run tests/some.test.ts           # single file (from inside the package)
vp run -r build                          # emit dist/
vp run -r docgen                         # type-check + run every JSDoc @example; require @since on every export
vp run fallow:audit                      # change-set review
```
