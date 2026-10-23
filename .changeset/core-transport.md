---
"@thomasfosterau/effect-connect": minor
"@thomasfosterau/effect-connect-resend": patch
"@thomasfosterau/effect-connect-twilio": patch
"@thomasfosterau/effect-connect-vonage": patch
"@thomasfosterau/effect-connect-slack": patch
"@thomasfosterau/effect-connect-discord": patch
---

The core gains a `Transport` module with the Worker-edge helpers every provider's `configFromEnv`, `resolveTransport(env)` and `noop` are built from: `boundString` / `boundSecret` (a binding is `some` when present and non-blank; a secret may arrive plain or `Redacted`), the `EnvBinding` / `EnvSecretBinding` types, `selectTransport(config, live, fallback)` and `droppingSender(line)`. The Resend, Twilio, Vonage, Slack and Discord providers use them in place of their own copies. Their behaviour and log lines are unchanged, and each `*Env` interface now names its bindings with the shared types.
