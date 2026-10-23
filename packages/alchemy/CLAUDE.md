# @thomasfosterau/effect-connect-alchemy

Deploy-time binding builders for Cloudflare Workers deployed with Alchemy: one builder per provider (`resendBindings`, `twilioBindings`, …) and one `effect/Config` form of each (`…BindingsConfig`). Each returns the record of Worker `env` bindings that the provider's `resolveTransport(env)` / `layerConfig` reads. The owner's decision on #82 (option 2) sets its shape.

## Boundary

- **Imports `effect` only.** It imports no `alchemy` and no other workspace package: the builders are plain records of `Redacted` / `string` values. `alchemy` is an optional peer that documents which Alchemy the shapes are written for.
- **No `alchemy` dev dependency.** alchemy's dependency tree fails `pnpm audit --audit-level high` (#82). The compile-time check against alchemy's `Cloudflare.InferEnv` waits on that (see the follow-up issue linked from #82).
- **Provider packages are dev dependencies only**, for the tests that assert each builder against the provider's env contract. `.fallowrc.json` zone `alchemy`, allowed: nothing.
- **Binds, never provisions.** No vendor-side resources (domains, API keys, Messaging Services).

## Invariants

- **Keys are the providers' env contracts** (`ResendEnv`, `TwilioEnv`, `VonageEnv`, `SlackEnv`, `DiscordEnv`, SendGrid's `layerConfig` names). `tests/alchemy.test.ts` asserts each bindings record, and its `Deployed` view, against the provider's type, and runs the provider's resolver on it.
- **Secrets are `Redacted`**, which Alchemy v2 deploys as `secret_text`; plain values are strings (`plain_text`). v2 shapes only, never v1's `alchemy.secret()`.
- **Unset optional values are absent from the record**, never `undefined` (Alchemy deploys that as a JSON binding) and never `""`. Blank counts as unset (`presentOnly`).
- **`sideEffects: false`**: modules only declare values.

## Terms

- **Bindings** — the record for a Worker's `env` (`ResendBindings`, …), built from literal input (`resendBindings(input)`) or read on the deploy machine (`resendBindingsConfig`).
- **Deployed** — `Deployed<B>`, the runtime view of a bindings record: every value a plain string.
