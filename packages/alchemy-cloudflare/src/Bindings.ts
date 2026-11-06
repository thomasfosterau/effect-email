/**
 * The types that tie a bindings record to Alchemy's Cloudflare provider
 * (`@alchemy.run/cloudflare`): what a record may hold, and what a Worker
 * receives once Alchemy has deployed it.
 *
 * @module Bindings
 * @since 0.1.0
 */

import type * as Cloudflare from "@alchemy.run/cloudflare";

/**
 * A record Alchemy's Cloudflare provider accepts as a Worker's `env`: every
 * value is a `Cloudflare.WorkerBindingResource` (a `Redacted` deploys as a
 * secret binding, a string as a plain one). Every builder's record satisfies
 * it, so it spreads into a `Cloudflare.Worker`'s `env` prop as is.
 *
 * @example
 * ```ts
 * import type { ResendBindings, WorkerBindings } from "@thomasfosterau/effect-connect-alchemy-cloudflare";
 *
 * const check = <B extends WorkerBindings<B>>(bindings: B): B => bindings;
 * const accept = (bindings: ResendBindings): ResendBindings => check(bindings);
 * console.log(typeof accept); // "function"
 * ```
 *
 * @since 0.1.0
 */
export type WorkerBindings<B> = {
  readonly [K in keyof B]: Cloudflare.WorkerBindingResource;
};

/**
 * The `env` a Worker receives for a bindings record: the provider's own
 * `Cloudflare.InferEnv` of it. Alchemy deploys a `Redacted` value as a secret
 * binding and a string as a plain one, and the Worker reads both back as
 * plain strings; optional keys stay optional.
 *
 * A provider's env contract (`ResendEnv`, …) accepts this type, which is
 * what the package's tests assert for every builder.
 *
 * @example
 * ```ts
 * import type { Deployed, ResendBindings } from "@thomasfosterau/effect-connect-alchemy-cloudflare";
 *
 * const env: Deployed<ResendBindings> = { RESEND_API_KEY: "re_123" };
 * console.log(env.RESEND_API_KEY); // "re_123"
 * ```
 *
 * @since 0.1.0
 */
export type Deployed<B extends WorkerBindings<B>> = Cloudflare.InferEnv<B>;
