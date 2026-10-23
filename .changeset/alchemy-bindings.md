---
"@thomasfosterau/effect-connect-alchemy": minor
---

New package: deploy-time bindings for Cloudflare Workers deployed with Alchemy. Each provider has a builder (`resendBindings`, `sendGridBindings`, `twilioBindings`, `vonageBindings`, `slackBindings`, `discordBindings`) and a `…BindingsConfig` form, which reads the same names through `effect/Config` on the deploy machine. Each returns the Worker `env` record that the provider's `resolveTransport(env)` / `layerConfig` reads, under the provider's own keys. Secrets are `Redacted` values, and unset optional values are left out. `Deployed<B>` is the runtime view of such a record. The package depends on `effect` only; `alchemy` is an optional peer.
