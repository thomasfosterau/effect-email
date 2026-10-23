/**
 * The runtime view of a bindings record: what a Worker receives once Alchemy
 * has deployed it.
 *
 * @module Bindings
 * @since 0.1.0
 */

import type * as Redacted from "effect/Redacted";

/**
 * The `env` a Worker receives for a bindings record: Alchemy deploys a
 * `Redacted` value as a secret binding and a string as a plain one, and the
 * Worker reads both back as plain strings. Optional keys stay optional.
 *
 * A provider's env contract (`ResendEnv`, `TwilioEnv`, …) accepts this type,
 * which is what the package's tests assert for every builder.
 *
 * @example
 * ```ts
 * import type { Deployed, ResendBindings } from "@thomasfosterau/effect-connect-alchemy";
 *
 * const env: Deployed<ResendBindings> = { RESEND_API_KEY: "re_123" };
 * console.log(env.RESEND_API_KEY); // "re_123"
 * ```
 *
 * @since 0.1.0
 */
export type Deployed<B> = {
  readonly [K in keyof B]: B[K] extends Redacted.Redacted<string> | string ? string : never;
};
