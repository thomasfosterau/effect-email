#!/usr/bin/env bash
#
# Publish every workspace package whose version is not yet on npm, then tag.
#
# Run by the Release workflow (changesets/action `publish-script`) once the
# "Version Packages" PR has merged. Publishes with the npm CLI (npm OIDC
# trusted publishing, which needs npm >= 11.5.1 — the Release job pins one),
# but the tarball is built by `pnpm pack`, which is what rewrites
# `catalog:peers` / `workspace:*` specifiers and applies `publishConfig` (the
# `dist/` exports) in the published manifest; `npm pack` would ship the
# workspace manifest as-is. (pnpm 11's own `pnpm publish` also does OIDC
# trusted publishing natively; switching to it is possible but not done here.)
#
# No `--provenance`: npm attaches provenance by itself under trusted publishing
# once the repository and the package are both public, and an explicit
# provenance request from a private repository makes the publish fail.
#
# Idempotent: a package already published at its current version is skipped,
# so a partial run can be re-run without failing on the packages that made it.

set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
out="$root/.release"
rm -rf "$out"
mkdir -p "$out"

for dir in "$root"/packages/*/; do
  name="$(node -p "require('$dir/package.json').name")"
  version="$(node -p "require('$dir/package.json').version")"
  if npm view "$name@$version" version >/dev/null 2>&1; then
    echo "skip: $name@$version is already published"
    continue
  fi
  echo "pack: $name@$version"
  # `--config.ignore-scripts=true`: no `prepack` / `prepare` / `postpack` runs
  # in the id-token job (none is defined today). `pnpm pack` has no
  # `--ignore-scripts` flag (pnpm 11 rejects it as an unknown option), so the
  # setting is passed as config; the tarball is byte-identical either way.
  (cd "$dir" && pnpm pack --config.ignore-scripts=true --pack-destination "$out" >/dev/null)
  tarball="$(ls -t "$out"/*.tgz | head -1)"
  echo "publish: $tarball"
  npm publish "$tarball" --access public
  rm -f "$tarball"
done

# Emits the `New tag:` lines the Changesets action parses to push the tags
# and create the GitHub releases.
pnpm exec changeset tag
