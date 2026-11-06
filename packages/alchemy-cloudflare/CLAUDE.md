# @thomasfosterau/effect-connect-alchemy-cloudflare

Deploy-time binding builders for Cloudflare Workers deployed with Alchemy's Cloudflare provider (`@alchemy.run/cloudflare`): one builder per provider (`resendBindings` for Resend, the one provider today) and one `effect/Config` form of each (`…BindingsConfig`). Each returns the record of Worker `env` bindings that the provider's `resolveTransport(env)` / `layerConfig` reads. The owner's decision on #82 (option 2) sets its shape; the owner's rule "split Alchemy packages per Alchemy provider" sets its name: this package is the Cloudflare provider's, and another Alchemy provider gets a package of its own.

## Boundary

- **Imports `effect` at runtime, and `@alchemy.run/cloudflare` for types only.** The builders are plain records of `Redacted` / `string` values; `src/Bindings.ts` takes its types from the provider (`Cloudflare.WorkerBindingResource`, `Cloudflare.InferEnv`) with `import type`, so the emitted `.d.ts` names `@alchemy.run/cloudflare` and the emitted `.js` imports nothing from it. No other workspace package.
- **`@alchemy.run/cloudflare`, `alchemy` and `effect` are required peers** (`catalogs.alchemy-peers`): the provider and the `alchemy` it peers on at the exact beta the apps pin (2.0.0-beta.85), and `effect ^4.1.0`, the range both require. The rest of effect-connect stays on `effect ^4.0.0`. Move the three with the dev pins in the default catalog (Dependabot's `alchemy` group moves only the dev pins).
- **Provider packages are dev dependencies only**, for the tests that assert each builder against the provider's env contract. `.fallowrc.json` zone `alchemy-cloudflare` (`src/`), allowed: nothing; zone `alchemy-cloudflare-tests` may import the providers.
- **Binds, never provisions.** No vendor-side resources (domains, API keys).

## Invariants

- **Keys are the providers' env contracts** (`ResendEnv`). `tests/alchemy.test.ts` asserts each bindings record, its `Deployed` view and the `Cloudflare.InferEnv` of a Worker bound with it against the provider's type, that the record is a `WorkerBindings` and a `Cloudflare.WorkerBindingProps`, and runs the provider's resolver on it.
- **Secrets are `Redacted`**, which Alchemy v2 deploys as `secret_text`; plain values are strings (`plain_text`). v2 shapes only, never v1's `alchemy.secret()`.
- **Unset optional values are absent from the record**, never `undefined` (Alchemy deploys that as a JSON binding) and never `""`; `Deployed<B>` keeps an optional key an optional `string`. No builder binds an optional value today; the next one that does keeps this rule.
- **`sideEffects: false`**: modules only declare values.

## Terms

- **Bindings** — the record for a Worker's `env` (`ResendBindings`, …), built from literal input (`resendBindings(input)`) or read on the deploy machine (`resendBindingsConfig`). `WorkerBindings<B>` is the constraint every such record meets: each value a `Cloudflare.WorkerBindingResource`.
- **Deployed** — `Deployed<B>`, `Cloudflare.InferEnv<B>`: the `env` a Worker bound with a bindings record receives, every value a plain string.
