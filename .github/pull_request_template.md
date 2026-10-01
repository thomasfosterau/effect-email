## Summary

Describe what changed and why. If this closes an issue, add `Closes #N` so it auto-closes on merge to `main`.

## Verification

Run the gates in [AGENTS.md → Verification](https://github.com/thomasfosterau/effect-email/blob/main/AGENTS.md#verification) and list each command with its final pass/fail. Say which gate couldn't run, and why.

## Changeset

- [ ] A changeset under `.changeset/` for every change to a published package's behaviour (or: none needed, because …)

## Notes

Anything reviewers should pay special attention to: exported signatures, declaration-emit shape, peer ranges, behaviour ported from an application that must stay byte-compatible.
