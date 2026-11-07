# @thomasfosterau/effect-connect-alchemy-cloudflare

## 0.1.0

### Minor Changes

- [#93](https://github.com/thomasfosterau/effect-connect/pull/93) [`648a433`](https://github.com/thomasfosterau/effect-connect/commit/648a4333a5c1df54406e9e055bdc438b7e67f522) Thanks [@thomasfosterau](https://github.com/thomasfosterau)! - New package: deploy-time bindings for Cloudflare Workers deployed with Alchemy's Cloudflare provider (`@alchemy.run/cloudflare`). Each provider has a builder (`resendBindings`, for the Resend provider) and a `…BindingsConfig` form, which reads the same names through `effect/Config` on the deploy machine. Each returns the Worker `env` record that the provider's `resolveTransport(env)` / `layerConfig` reads, under the provider's own keys. Secrets are `Redacted` values, and unset optional values are left out. The types are the Cloudflare provider's: `WorkerBindings<B>` checks that every value is a `Cloudflare.WorkerBindingResource`, and `Deployed<B>` is `Cloudflare.InferEnv<B>`, the `env` a Worker bound with the record receives (an optional binding stays an optional `string`). `@alchemy.run/cloudflare` and `alchemy` (both exactly 2.0.0-beta.85) are required peers, and the `effect` peer is `^4.1.0`, the range they require.

### Patch Changes

- [#103](https://github.com/thomasfosterau/effect-connect/pull/103) [`d22f8e8`](https://github.com/thomasfosterau/effect-connect/commit/d22f8e856f3c82b0bcc6ae454398f63be8ecb2cd) Thanks [@thomasfosterau](https://github.com/thomasfosterau)! - Spell `Redacted.Redacted<string>` as `Redacted.Redacted` (its default type argument) in the emitted declarations. No behaviour change.
