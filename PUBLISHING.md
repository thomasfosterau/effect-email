# Publishing & releases

Releases are automated with [Changesets](https://github.com/changesets/changesets) and published to npm via [OIDC trusted publishing](https://docs.npmjs.com/trusted-publishers) — there is no `NPM_TOKEN`. See [SECURITY.md](./SECURITY.md) for the security rationale behind the pipeline.

## The release flow

1. **Add a changeset with your change.** Run `pnpm changeset`, pick the bump (`patch` / `minor` / `major`) and write a user-facing summary, then commit the generated file alongside your change. (Changes that don't affect the published package — docs, CI, examples — need no changeset.)
2. **Merge to `main`.** The [`release`](./.github/workflows/release.yml) workflow runs and, while changesets are pending, opens or updates a **"Version Packages"** PR that applies the version bump and rolls the changesets into `CHANGELOG.md`.
3. **Merge the "Version Packages" PR.** With no changesets left, the workflow publishes the new version to npm (with provenance) via the npm CLI and trusted publishing, then tags the commit and creates the GitHub release.

The publish step (`scripts/release.sh`) packs each workspace package with `pnpm pack` — which is what rewrites the `catalog:peers` / `workspace:*` specifiers and applies each package's `publishConfig` (the `dist/` exports) in the published manifest — and publishes the tarball with the npm CLI (`npm publish`) rather than `pnpm publish`, because pnpm does not yet support npm OIDC trusted publishing ([pnpm#9812](https://github.com/pnpm/pnpm/issues/9812)). A package already published at its current version is skipped, so a partial run can be re-run. `changeset tag` then emits the `New tag:` lines the Changesets action uses to push the tags and create the GitHub releases.

## Maintainer setup (one-time)

None of the three packages (`@thomasfosterau/effect-email`, `@thomasfosterau/effect-email-sendgrid`, `@thomasfosterau/effect-email-resend`) has been published yet. npm's trusted-publisher binding is configured per package on npmjs.com, which needs the package to exist — so the first release of each is a one-off owner action (a manual `npm publish` of the `pnpm pack` tarball from a machine with an npm session, or a classic token used once and then revoked), after which the following steps make the automated flow work end-to-end:

1. **Allow Actions to open the Version Packages PR.** In the repo: **Settings → Actions → General → Workflow permissions** → enable **"Allow GitHub Actions to create and approve pull requests"**. Without this the built-in `GITHUB_TOKEN` is forbidden from opening pull requests and the workflow fails at the PR-creation step — even though the job already grants `pull-requests: write`.
2. **Configure the trusted publisher.** On npmjs.com, open each of the three packages → **Settings → Trusted Publisher** and add:
   - Provider: **GitHub Actions**
   - Repository: `thomasfosterau/effect-email`
   - Workflow: `release.yml`
   - Environment: `release`

   Then remove any classic automation tokens for the packages.

3. **Protect the `release` environment.** **Settings → Environments → `release`** → enable **Required reviewers** (yourself) and restrict deployment to the `main` branch, so publishing pauses for manual approval.
4. **Protect `main`.** Require pull requests and passing CI before merge, and disallow direct pushes, so a release can only be triggered by merging the reviewed "Version Packages" PR.
