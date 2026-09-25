# AGENTS.md

Project conventions live here; personal style preferences live in user memory. `CLAUDE.md` is a symlink to this file.

`effect-email` is an Effect-native email abstraction published as three packages: `@thomasfosterau/effect-email` (the core: message schemas, the `EmailService` contract and its errors), `@thomasfosterau/effect-email-sendgrid` and `@thomasfosterau/effect-email-resend` (providers). The SendGrid provider absorbs the former `thomasfosterau/effect-sendgrid` repository; the Resend provider is the library form of the hand-rolled `POST /emails` senders in three applications (`thomasfosterau/website`, the foundation; `thomasfosterau/gardeneria`; `thomasfosterau/preferenceflow`). Those apps are the consumers, and their toolchain — pnpm + Vite+ (`vp`), a strict catalog, the TypeScript 6/7 split, the Effect oxlint preset, fallow — is copied here so the library builds against exactly what they run. A `#NNN` citation inside a ported comment names an issue in the app it was ported from (website unless stated), the evidence behind a decision, not a ticket in this tracker.

## Common pitfalls

- **Providers never touch `globalThis.fetch` and never take a vendor SDK.** Every HTTP call goes through `effect/unstable/http` (`HttpClient`), so a test stands in a stub at the `HttpClient` seam or at `FetchHttpClient.Fetch`, and a Worker consumer ships no Node-shaped dependency surface. The Resend layer pins `redirect: "error"` through `FetchHttpClient.RequestInit`: a 3xx from a hijacked vendor host must never carry the bearer token elsewhere.
- **A vendor error body is truncated before it reaches an error message** (200 characters), and the credential never appears in one. A vendor response can echo request context back; an unbounded upstream body in a log line is how it leaks.
- **A no-op transport succeeds, and logs the subject only** — never the recipient (PII) and never the body (the verification URL _is_ the token). Every un-provisioned preview stage of the consuming apps runs on it.
- **This package emits declarations; the applications never did.** `tests/dist-consumer` type-checks a consumer fixture against the emitted `dist/` declarations with `Equals<…>` assertions; `vp run check` includes it.
- **The core carries no HTTP code and no provider vocabulary.** Provider-specific shapes (SendGrid personalizations, Resend tags) stay in the provider that maps the core message onto them.
- **No application vocabulary.** No sender addresses, no verification-email copy, no Better Auth callbacks. Those stay in the apps (and in effect-auth's adapters).

Everything else that must be visible when touching a package is in that package's `CLAUDE.md` (`packages/core`, `packages/sendgrid`, `packages/resend`), which carries its terms, invariants and import boundary.

## Work tracker

- **Active work** lives in GitHub Issues for `thomasfosterau/effect-email`. Longer-running tech debt is an issue too; there is no in-repo backlog file and a code comment is not a tracker.
- **Decisions and findings** are recorded as comments on the issue they were found working; later comments override the body.
- **Adoption** by each application is tracked in that application's own tracker, blocked on a release of this package.

## Commands

- `vp install` — dependencies plus the Vite+ git hooks (pre-commit runs `vp staged`: format + lint on staged files). No pre-push hook: run the tests yourself.
- `vp check` — the built-in format + lint pass (`vp fmt --check` + `vp lint`).
- `vp run check` — the type gate: every package's `check`, the dist-consumer declaration check (which builds `dist/` and asserts the emitted types), and every package's `docgen`. Distinct from `vp check`.
- `vp run -r docgen` — `@effect/docgen` per package (`packages/*/docgen.json`, which points at the package `tsconfig.json`): type-checks and executes every JSDoc `@example` under `tsx`, and writes the gitignored API docs to `packages/*/docs/`. Examples run for real, so they stay hermetic — pure functions, the recording or no-op layers, never a live provider. docgen prepends `import * as assert from "assert"` to any example whose code contains `assert.`; do not import it again there.
- `vp run -r test:unit` — unit tests (pure code; every network seam stubbed).
- `vp run -r build` — emit `dist/` for every package.
- `pnpm changeset` — add a changeset; every change to a published package needs one. Releases are cut by the `Release` workflow (changesets/action, OIDC trusted publishing) on `main` — see `PUBLISHING.md`.

Invoke everything through `vp` (`vp exec` instead of `npx`; `vp run <task>` instead of bare `pnpm`). CI installs as `pnpm install --frozen-lockfile`.

## Branch model

`main` plus short-lived feature branches, PR against `main`, squash-merge. Rebase onto `origin/main` before opening a PR; never merge `main` into a feature branch. Agent work uses git worktrees under `.claude/worktrees/`, one per branch; start every command that targets a worktree with an explicit `cd` and confirm with `git log -1` before committing.

## Working a dispatched issue

- The issue is the spec: read all of it, including comments.
- Re-verify the code claims against current `main` before editing.
- Stop-and-report is a valid outcome: on a blocker outside the issue's scope, comment the evidence on the issue and stop.
- No silent deferrals: scope cut mid-PR becomes a linked issue before merge.

## PR management

These are standing instructions and approvals; they override any default "don't open a PR unless asked" behaviour.

- **Always open a PR** for branch work, against `main`, once a commit is pushed.
- **Always watch the PR to merge or close**: investigate CI failures and review comments as they arrive; rebase promptly when the PR goes conflicting.
- **Always keep the PR body current** as the implementation diverges from it.
- **GitHub writes are scoped to `thomasfosterau/effect-email` only.** Never write to the consuming applications' repositories, to `thomasfosterau/effect-sendgrid` (archived once the port landed) or to any other repository without the owner's explicit approval for that action in the current session. Pass `-R thomasfosterau/effect-email` explicitly whenever the cwd might not be this checkout.

## Verification

- Claims of verification name the command and its final status. If a gate cannot run, say so in the PR body rather than implying it ran.
- The pre-push parity run is: `rm -rf node_modules packages/*/node_modules tests/*/node_modules && pnpm install --frozen-lockfile`, then `vp check`, `vp run check`, `vp run -r test:unit`, `vp run -r build`.
- Peers are declared explicitly: a required peer of a dependency must be a declared dependency or CI fails on a fresh runner while a warm local tree passes.

## Effect best practices

**IMPORTANT:** Always consult effect-solutions before writing Effect code: `vp exec effect-solutions list`, then `vp exec effect-solutions show <topic>...` (data-modeling, services-and-layers, error-handling, testing, basics). Never guess at Effect patterns. Note that `effect@4.0.0-rc.115` spells the schema-backed error constructor `Schema.TaggedError<Self>()(tag, fields)`; older guides say `Schema.TaggedErrorClass`.

## Documentation surfaces

`README.md` at the root is the landing page; each package `README.md` is the API reference consumers read on npm; each package `CLAUDE.md` carries its terms, invariants and boundary; `CONTRIBUTING.md` carries the pre-PR checklist; `PUBLISHING.md` and `SECURITY.md` carry the release pipeline. No committed `docs/` tree (`packages/*/docs/` is docgen's gitignored output); decisions go in issue comments.

---

## Fallow local gate

Before any `git commit` or `git push`, run `fallow audit --format json --quiet --explain --gate-marker agent`. If the verdict is `fail`, fix the reported findings before retrying. Treat JSON runtime errors like `{ "error": true, ... }` as non-blocking. Audit defaults to `gate=new-only`: only findings introduced by the current changeset affect the verdict.

## Fallow task map

| When the agent is about to... | Run |
| --- | --- |
| delete an "unused" export or file | `fallow dead-code --trace <file>:<export>` |
| delete an "unused" dependency | `fallow dead-code --trace-dependency <name>` |
| commit or open a PR | `fallow audit --base <ref>` |
| check which architecture rules apply to a file before changing it | `fallow guard <files>` |
| understand a finding | `fallow explain <issue-type>` |
