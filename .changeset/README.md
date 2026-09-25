# Changesets

Every change to a published package needs a changeset: run `pnpm changeset`, pick the bump and write a user-facing summary, then commit the generated file with your change. The `Release` workflow rolls pending changesets into a "Version Packages" PR and publishes once it merges — see [PUBLISHING.md](../PUBLISHING.md).
