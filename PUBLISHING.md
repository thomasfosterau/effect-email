# Publishing & releases

Releases are automated with [Changesets](https://github.com/changesets/changesets) and published to npm via [OIDC trusted publishing](https://docs.npmjs.com/trusted-publishers) — there is no `NPM_TOKEN`. See [SECURITY.md](./SECURITY.md) for the security rationale behind the pipeline.

## The release flow

1. **Add a changeset with your change.** Run `pnpm changeset`, pick the bump (`patch` / `minor` / `major`) and write a user-facing summary, then commit the generated file alongside your change. (Changes that don't affect the published package — docs, CI, examples — need no changeset.)
2. **Merge to `trunk`.** The [`release`](./.github/workflows/release.yml) workflow runs and, while changesets are pending, opens or updates a **"Version Packages"** PR that applies the version bump and rolls the changesets into `CHANGELOG.md`.
3. **Merge the "Version Packages" PR.** With no changesets left, the workflow publishes the new version to npm via the npm CLI and trusted publishing (with provenance once the repository is public — see below), then tags the commit and creates the GitHub release.

The version step (`pnpm run version`) runs `changeset version`, then `vp fmt`, then `pnpm install --lockfile-only`. Changesets v3 formats the changelogs it writes with whatever formatter it detects, and it detects the `oxfmt` shim that Vite+ installs; that shim only serves editors and exits non-zero when run directly. So `.changeset/config.json` sets `"format": false` and the script formats with `vp fmt` itself.

The publish step (`scripts/release.sh`) packs each workspace package with `pnpm pack` — which is what rewrites the `catalog:peers` / `workspace:*` specifiers and applies each package's `publishConfig` (the `dist/` exports) in the published manifest — and publishes the tarball with the npm CLI (`npm publish`). npm's OIDC trusted publishing needs npm >= 11.5.1. The npm that Node `latest` bundles already meets that, but it changes with every Node release, so the Release job installs an **exact**, reviewed npm version (`npm install -g npm@11.20.0`, bumped by hand — neither the bundled npm nor `@latest`, which would put whatever the runner or the registry serves that day into the job holding `id-token: write`). (pnpm 11's `pnpm publish` also performs the OIDC exchange natively — the pnpm-10-era [pnpm#9812](https://github.com/pnpm/pnpm/issues/9812) no longer applies — so moving to it would drop the npm upgrade altogether; the npm CLI path is kept for now.) A package already published at its current version is skipped, so a partial run can be re-run. `changeset tag` then emits the `New tag:` lines the Changesets action uses to push the tags and create the GitHub releases.

The release job sets `pnpm_config_verify_deps_before_run: "false"`. pnpm 11 otherwise checks dependencies before each `pnpm run` / `pnpm exec` and, when a manifest looks newer than the `--ignore-scripts` install, re-installs **with** scripts — running the root `prepare` and every `allowBuilds` dependency's build script inside the job that holds `id-token: write`. (pnpm 11 reads only the `pnpm_config_*` spelling of this setting.) `scripts/release.sh` also packs with `pnpm pack --config.ignore-scripts=true` (`pnpm pack` has no `--ignore-scripts` flag), and `npm publish` of a tarball runs no lifecycle script, so no package `prepack` / `prepare` / `postpack` runs there either.

**Provenance.** Nothing in the pipeline requests [provenance](https://docs.npmjs.com/generating-provenance-statements). Under trusted publishing npm attaches it by itself only when the OIDC token reports a **public** repository and the package is public on the registry. This repository is private, so releases carry no provenance statement today; they will once it is made public. Do not add `--provenance` or `NPM_CONFIG_PROVENANCE=true`: the npm CLI honours both, and an explicit provenance request from a private repository fails the publish.

## Maintainer setup (one-time)

None of the three packages (`@thomasfosterau/effect-email`, `@thomasfosterau/effect-email-sendgrid`, `@thomasfosterau/effect-email-resend`) has been published yet. npm's trusted-publisher binding is configured per package on npmjs.com, which needs the package to exist — so the first release of each is a one-off owner action (a manual `npm publish` of the `pnpm pack` tarball from a machine with an npm session, or a classic token used once and then revoked), after which the following steps make the automated flow work end-to-end:

1. **Allow Actions to open the Version Packages PR.** In the repo: **Settings → Actions → General → Workflow permissions** → enable **"Allow GitHub Actions to create and approve pull requests"**. Without this the built-in `GITHUB_TOKEN` is forbidden from opening pull requests and the workflow fails at the PR-creation step — even though the job already grants `pull-requests: write`.
2. **Configure the trusted publisher.** On npmjs.com, open each of the three packages → **Settings → Trusted Publisher** and add:
   - Provider: **GitHub Actions**
   - Repository: `thomasfosterau/effect-email`
   - Workflow: `release.yml`
   - Environment: `release`

   Then remove any classic automation tokens for the packages.

3. **Protect the `release` environment.** **Settings → Environments → `release`** → enable **Required reviewers** (yourself) and restrict deployment to the `trunk` branch, so publishing pauses for manual approval.
4. **Protect `trunk`.** Require pull requests and passing CI before merge, and disallow direct pushes, so a release can only be triggered by merging the reviewed "Version Packages" PR.
