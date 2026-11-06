# @thomasfosterau/effect-connect-alchemy

Deploy-time binding builders for Cloudflare Workers deployed with Alchemy: one builder per provider (`resendBindings` for Resend, the one provider today) and one `effect/Config` form of each (`…BindingsConfig`). Each returns the record of Worker `env` bindings that the provider's `resolveTransport(env)` / `layerConfig` reads. The owner's decision on #82 (option 2) sets its shape.

## Boundary

- **Imports `effect` only.** It imports no `alchemy` and no other workspace package: the builders are plain records of `Redacted` / `string` values. `alchemy` is an optional peer that documents which Alchemy the shapes are written for.
- **`alchemy` is a dev dependency only, never a declared peer range.** `alchemy` and `@alchemy.run/cloudflare` (the Cloudflare provider since beta.84) are dev dependencies for the compile-time check against `Cloudflare.InferEnv` in `tests/alchemy.test.ts` (#94); both are type-only imports there. At runtime `alchemy` stays an optional peer declared in `peerDependenciesMeta` alone: a `peerDependencies` range made pnpm install alchemy's tree for consumers (#82).
- **Provider packages are dev dependencies only**, for the tests that assert each builder against the provider's env contract. `.fallowrc.json` zone `alchemy` (`src/`), allowed: nothing; zone `alchemy-tests` may import the providers.
- **Binds, never provisions.** No vendor-side resources (domains, API keys).

## Invariants

- **Keys are the providers' env contracts** (`ResendEnv`). `tests/alchemy.test.ts` asserts each bindings record, its `Deployed` view and the `Cloudflare.InferEnv` of a Worker bound with it against the provider's type, asserts `Deployed` equals that `InferEnv`, and runs the provider's resolver on it.
- **Secrets are `Redacted`**, which Alchemy v2 deploys as `secret_text`; plain values are strings (`plain_text`). v2 shapes only, never v1's `alchemy.secret()`.
- **Unset optional values are absent from the record**, never `undefined` (Alchemy deploys that as a JSON binding) and never `""`; `Deployed<B>` keeps an optional key an optional `string`. No builder binds an optional value today; the next one that does keeps this rule.
- **`sideEffects: false`**: modules only declare values.

## Terms

- **Bindings** — the record for a Worker's `env` (`ResendBindings`, …), built from literal input (`resendBindings(input)`) or read on the deploy machine (`resendBindingsConfig`).
- **Deployed** — `Deployed<B>`, the runtime view of a bindings record: every value a plain string.
