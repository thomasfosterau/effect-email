/**
 * What every builder in this package shares: the runtime view of a bindings
 * record, and the rule that an unset optional value is left out of the
 * record rather than bound empty.
 *
 * @module Bindings
 * @since 0.1.0
 */

import * as Option from "effect/Option";
import * as R from "effect/Record";
import type * as Redacted from "effect/Redacted";
import * as Str from "effect/String";

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

/**
 * The present entries of a record of optional values, as a record holding
 * only those keys. An absent or blank value is omitted, never bound as
 * `undefined` (Alchemy would deploy that as a JSON binding) or as `""`: a
 * blank binding is the same case as an absent one to every provider's
 * resolver.
 *
 * @internal
 */
export const presentOnly = <K extends string>(entries: {
  readonly [P in K]: Option.Option<string>;
}): { readonly [P in K]?: string } =>
  // SAFETY: `getSomes` keeps a subset of the keys of `entries`, each holding
  // the string inside its `some`; it only widens the key type to `string`.
  R.getSomes(
    R.map(
      entries,
      Option.filter((value: string) => Str.isNonEmpty(value.trim())),
    ),
  ) as { readonly [P in K]?: string };
