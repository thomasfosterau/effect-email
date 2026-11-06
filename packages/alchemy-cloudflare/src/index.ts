/**
 * `@thomasfosterau/effect-connect-alchemy-cloudflare` — deploy-time bindings
 * for `@thomasfosterau/effect-connect` on Cloudflare Workers deployed with
 * [Alchemy](https://alchemy.run)'s Cloudflare provider
 * (`@alchemy.run/cloudflare`). One builder per provider (Resend today)
 * produces the record of `env` bindings that provider's
 * `resolveTransport(env)` (or `layerConfig`) reads, under the same keys, with
 * secrets as `Redacted` values (Alchemy deploys those as secret bindings) and
 * unset optional values left out. Each also has a `…BindingsConfig` form
 * that reads the values on the deploy machine through `effect/Config`.
 *
 * Its types are the Cloudflare provider's: every record is a
 * `WorkerBindings` (each value a `Cloudflare.WorkerBindingResource`), and
 * `Deployed<B>` is `Cloudflare.InferEnv<B>`, the `env` a Worker bound with
 * it receives. `@alchemy.run/cloudflare` is a required peer for those types
 * alone: nothing imports it at runtime.
 *
 * It binds credentials only: it provisions nothing on the vendor's side
 * (domains, API keys).
 *
 * @module index
 * @since 0.1.0
 */

/**
 * The Cloudflare provider's view of a bindings record (`WorkerBindings`,
 * `Deployed`).
 *
 * @since 0.1.0
 */
export * from "./Bindings.ts";
/**
 * The Resend bindings (`RESEND_API_KEY`).
 *
 * @since 0.1.0
 */
export * from "./Resend.ts";
