---
"@thomasfosterau/effect-connect": minor
"@thomasfosterau/effect-connect-resend": patch
---

The core gains a `Transport` module with the Worker-edge helpers every provider's `configFromEnv`, `resolveTransport(env)` and `noop` are built from: `boundString` / `boundSecret` (a binding is `some` when present and non-blank; a secret may arrive plain or `Redacted`), the `EnvBinding` / `EnvSecretBinding` types, `selectTransport(config, live, fallback)` and `droppingSender(line)`. The Resend provider uses them in place of its own copies. Its behaviour and log lines are unchanged, and `ResendEnv` now names its bindings with the shared types.
