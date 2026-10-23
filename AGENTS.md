# AGENTS.md

`CLAUDE.md` is a symlink to this file. effect-connect publishes an Effect-native messaging abstraction (email and SMS today, one service per channel) for the `thomasfosterau/website`, `gardeneria` and `preferenceflow` applications, and copies their toolchain (pnpm + Vite+, strict catalog, TypeScript 6/7 split, Effect oxlint preset, fallow) so it builds against what they run. A `#NNN` in a ported comment names an issue in the app it came from (website unless stated), not a ticket in this tracker.

| Package | Directory | Purpose |
| --- | --- | --- |
| `@thomasfosterau/effect-connect` | `packages/core` | Per-channel message schemas, the `EmailService` and `SmsService` contracts, their errors, and the shared `effect/http` transport rules (`Http`). No provider vocabulary. |
| `@thomasfosterau/effect-connect-sendgrid` | `packages/sendgrid` | SendGrid v3 provider and resource client (absorbs the archived `thomasfosterau/effect-sendgrid`). |
| `@thomasfosterau/effect-connect-resend` | `packages/resend` | Resend provider, no-op transport, Worker env resolver. |
| `@thomasfosterau/effect-connect-twilio` | `packages/twilio` | Twilio SMS provider (Programmable Messaging), no-op transport, Worker env resolver. |
| `@thomasfosterau/effect-connect-vonage` | `packages/vonage` | Vonage SMS provider (Messages API), no-op transport, Worker env resolver. |

Each package's `CLAUDE.md` carries its boundary, invariants and terms; read it before touching that package.

## Common pitfalls

- **Providers never touch `globalThis.fetch` and never take a vendor SDK.** Every HTTP call goes through `effect/http` (`HttpClient`), so a test stands in a stub at the `HttpClient` seam or at `FetchHttpClient.Fetch`, and a Worker consumer ships no Node-shaped dependency surface.
- **A vendor error body is truncated before it reaches an error message** (200 characters), and the credential never appears in one. A vendor response can echo request context back; an unbounded upstream body in a log line is how it leaks.
- **This package emits declarations; the applications never did.** `tests/dist-consumer` type-checks a consumer fixture against the emitted `dist/` declarations with `Equals<…>` assertions; `vp run check` includes it.
- **The core carries no provider vocabulary.** It may carry vendor-neutral HTTP code: `Http.ts` holds the transport rules every provider applies (`refuseRedirects`, `rejectionMessage`, `describeHttpError`, `httpErrorStatus`, `isSuccessStatus`), and a provider uses those rather than a copy of its own. Provider-specific shapes (SendGrid personalizations, Resend tags, Twilio Messaging Services) stay in the provider that maps the core message onto them.
- **One service per channel.** A new channel (push, chat) is a model module plus a service module in the core (`Sms.ts` + `SmsService.ts` are the template) and its own send / validation errors; never one service multiplexing every channel, so a consumer's requirements name exactly the channels it uses. A provider package implements one or more channels' services.
- **No application vocabulary.** No sender addresses, no verification-email or sign-in-code copy, no Better Auth callbacks. Those stay in the apps (and in effect-auth's adapters).
- **Every external version lives in the catalog** (`pnpm-workspace.yaml`, `catalogMode: strict`); `package.json` files carry only `catalog:`, `catalog:peers` or `workspace:*`. After editing the catalog, run `pnpm install` and commit `pnpm-lock.yaml`; a stale lockfile fails CI with `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH`.
- **`@effect/tsgo`, `@typescript/native` and `vite-plus` bump as a set.** `pnpm install`'s `prepare` script runs `effect-tsgo patch --typescript --oxlint`, which hard-errors on an unsupported pairing; read the catalog comment on `@effect/tsgo` before touching any of the three. Dependabot's `toolchain` group proposes them in one PR (`.github/dependabot.yml`); the `overrides` security floors in `pnpm-workspace.yaml` are by hand, removed once their parent requires the fixed version.

## Conventions

- Relative imports carry their `.ts` extension (`rewriteRelativeImportExtensions` permits it under `noEmit`; `vp pack` bundles each entry, so no relative specifier reaches `dist/`).
- `exactOptionalPropertyTypes` is on: spell an optional field a caller may forward `undefined` to as `?: T | undefined`.
- Every export has a TSDoc summary. `vp run -r docgen` type-checks and executes every `@example`, so an example is a complete program that runs without a network: pure functions, the recording or no-op layers, never a live provider. An example that uses `assert.` imports it itself (`import * as assert from "node:assert"`): docgen adds no imports. Each package's `docgen.json` sets `"runExamples": true`; without it docgen only type-checks the examples.
- Every module doc and every export, each documented `export * from` in `src/index.ts` included, carries `@since <version>`: the release it first ships in (the version its changeset produces; `0.1.0` for the initial release). `vp run -r docgen` (so `vp run check`) fails on an export without one; it does not check module docs, so review catches those. Effect's tag order: summary, `@example`s, `@category` (if any), then `@since` last.
- Schema-backed errors: see [Effect](#effect) for the rc-line spelling.

## Commands

- `pnpm install` — dependencies, the Vite+ git hooks (pre-commit runs `vp staged`: format + lint on staged files) and the tsgo patch. There is no pre-push hook.
- `vp check` — format + lint (Oxfmt + Oxlint). `vp run check` — the type gate: every package's `check`, the dist-consumer declaration check (which builds `dist/`) and every package's docgen. They are different commands.
- `vp run -r test:unit` — unit tests (every network seam stubbed).
- `vp run test:coverage` — every package's suite in one run, writing the Istanbul map `coverage/coverage-final.json` that `fallow audit` reads for its CRAP scores. Run it before the fallow audit.
- `vp run -r build` — `vp pack` (tsdown) emits each package's `dist/`.
- `vp run -r docgen` — run docgen on its own (see Conventions); writes the gitignored API docs to `packages/*/docs/`.
- `pnpm changeset` — add a changeset.

Invoke tools through `vp` (`vp exec <bin>` for a package binary, `vp run <task>` rather than bare `pnpm run`). CI installs with `pnpm install --frozen-lockfile`.

## Verification

Before you report work as done, run the gates below in order and quote each command with its final pass/fail. If a gate can't run here, say which and why in the PR body; never imply it ran.

1. `vp check`
2. `vp run check` (includes docgen)
3. `vp run -r test:unit`
4. `vp run -r build`
5. `pnpm audit --audit-level high` (network)
6. `vp run test:coverage && fallow audit --format json --quiet --explain --gate-marker agent --base origin/trunk` (the PreToolUse hook also runs the audit on `git commit` / `git push`, but never refreshes the coverage map)

Steps 1–5 are what CI runs, in that order ([ci.yml](.github/workflows/ci.yml)); step 6 is local-only. A warm tree hides a missing peer: for CI parity, `rm -rf node_modules packages/*/node_modules tests/*/node_modules && pnpm install --frozen-lockfile` first. A required peer of a dependency must be a declared dependency, or a fresh runner fails where a warm local tree passes.

## Branches and pull requests

- Branch off `trunk`; PR against `trunk`; squash-merge. Name branches `issue-<n>-<slug>`. Rebase onto `origin/trunk` before opening or updating a PR; never merge `trunk` into your branch (GitHub's Update-branch button merges).
- Agent work uses git worktrees under `.claude/worktrees/`, one per branch, each with its own `pnpm install`. Start every command that targets a worktree with an explicit `cd`, and run `git log -1` before committing.
- Every change to a published package's behaviour carries a changeset (`pnpm changeset`); docs-, CI- and tooling-only changes need none. Never publish or version by hand: the Release workflow opens the "Version Packages" PR (`chore: version packages`) and the owner merges it. See [PUBLISHING.md](PUBLISHING.md).
- These are standing approvals: open a PR once a branch has a pushed commit; watch it to merge or close (investigate CI failures and review comments, rebase when it goes conflicting); keep the PR body current with what the branch does.
- GitHub writes go to `thomasfosterau/effect-connect` only; pass `-R thomasfosterau/effect-connect` whenever the cwd might be another checkout. Never write to the consuming applications, to `thomasfosterau/effect-sendgrid` (archived once the port landed) or to any other repository without the owner's explicit approval for that action in the current session. Use the `gh` CLI for GitHub operations, even when GitHub MCP tools are available.

## Work tracker

- Issues are the backlog: when you find work you can't do now, file an issue in `thomasfosterau/effect-connect` rather than leaving a TODO.
- The issue is the spec — read its comments; later comments override the body. Re-verify its code claims against current `trunk` before editing.
- Record decisions and findings as issue comments.
- Stop-and-report is a valid outcome: on a blocker outside the issue's scope, comment the evidence on the issue and stop.
- Scope cut mid-PR becomes a linked issue before merge.
- Adoption by each application is tracked in that application's own tracker, blocked on a release of this package.

## Effect

Read the installed package before writing Effect code: `node_modules/effect/dist/*.d.ts` and `node_modules/effect/src`, plus `node_modules/effect/ai-docs/` (the pinned version ships it; read `node_modules/effect/AGENTS.md` too if a later one does). Never guess at an Effect API.

- The pinned version is the `effect` entry in `pnpm-workspace.yaml`; the published peer floor is `catalogs.peers`.
- On the rc line the schema-backed error is `Schema.TaggedError<Self>()(tag, fields)`. Guides that say `Schema.TaggedErrorClass` describe the older beta line.
- HTTP lives under `effect/http/*`; the rc line has no `effect/unstable/*` paths.

## Agent sessions

- The SessionStart hook (`.claude/hooks/session-start.sh`) syncs dependencies against the lockfile and puts `vp`, `fallow` and `tsx` on PATH for non-interactive shells. It hydrates no secrets, and none are needed: every gate runs offline with the network seams stubbed.
- A PostToolUse hook runs `vp fmt --write` on every TS/JS (including `.tsx`/`.jsx`/`.mjs`/`.cjs`), CSS, JSON or Markdown file you edit.
- A PreToolUse hook (`.claude/hooks/fallow-gate.sh`) blocks `git commit` / `git push` when `fallow audit --base origin/trunk` fails.
- Won't run in an agent session: publishing (only the Release workflow's OIDC identity can).

## Documentation surfaces

`README.md` at the root is the landing page; each package `README.md` is the API reference consumers read on npm; each package `CLAUDE.md` carries its boundary, invariants and terms; `CONTRIBUTING.md` carries human setup and procedures; `PUBLISHING.md` and `SECURITY.md` carry the release pipeline and its one-time setup. No committed `docs/` tree (`packages/*/docs/` is docgen's gitignored output); decisions go in issue comments.

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
