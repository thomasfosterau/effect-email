#!/usr/bin/env bash
#
# Publish every workspace package whose version is not yet on npm, then tag.
#
# Run by the Release workflow (changesets/action `publish-script`) once the
# "Version Packages" PR has merged. Uses the npm CLI rather than `pnpm publish`
# because npm OIDC trusted publishing needs npm >= 11.5.1 and pnpm does not
# support it yet (https://github.com/pnpm/pnpm/issues/9812) — but the tarball
# is built by `pnpm pack`, which is what rewrites `catalog:peers` /
# `workspace:*` specifiers and applies `publishConfig` (the `dist/` exports)
# in the published manifest; `npm pack` would ship the workspace manifest as-is.
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
  (cd "$dir" && pnpm pack --pack-destination "$out" >/dev/null)
  tarball="$(ls -t "$out"/*.tgz | head -1)"
  echo "publish: $tarball"
  npm publish "$tarball" --access public --provenance
  rm -f "$tarball"
done

# Emits the `New tag:` lines the Changesets action parses to push the tags
# and create the GitHub releases.
pnpm exec changeset tag
