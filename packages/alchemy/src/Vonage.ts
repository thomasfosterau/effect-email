/**
 * The Worker bindings `@thomasfosterau/effect-connect-vonage` reads
 * (`VonageEnv`): the API key, the API secret as a secret, and the optional
 * default sender.
 *
 * @module Vonage
 * @since 0.1.0
 */

import * as Config from "effect/Config";
import * as Option from "effect/Option";
import type * as Redacted from "effect/Redacted";
import { presentOnly } from "./internal/presentOnly.ts";

/**
 * What {@link vonageBindings} takes. A `from` that is omitted, `undefined`
 * or blank is left out of the bindings.
 *
 * @since 0.1.0
 */
export interface VonageBindingsInput {
  /** The API key. */
  readonly apiKey: string;
  /** The API secret. */
  readonly apiSecret: Redacted.Redacted;
  /** The default sender. */
  // oxlint-disable-next-line effect/prefer-option-over-null -- a consumer-facing input: an omitted key IS "not bound", and asking every caller to spell `Option.none()` buys nothing
  readonly from?: string | undefined;
}

/**
 * The Vonage bindings for a Worker's `env`. `VONAGE_API_SECRET` is deployed
 * as a secret; `VONAGE_FROM` is present only when it has a value.
 *
 * @since 0.1.0
 */
export interface VonageBindings {
  readonly VONAGE_API_KEY: string;
  readonly VONAGE_API_SECRET: Redacted.Redacted;
  readonly VONAGE_FROM?: string;
}

/**
 * The Vonage bindings from literal values, to spread into a Worker's `env`.
 *
 * @example
 * ```ts
 * import * as assert from "node:assert";
 * import * as Redacted from "effect/Redacted";
 * import { vonageBindings } from "@thomasfosterau/effect-connect-alchemy";
 *
 * const env = vonageBindings({ apiKey: "abc123", apiSecret: Redacted.make("secret"), from: " " });
 * assert.deepStrictEqual(Object.keys(env).sort(), ["VONAGE_API_KEY", "VONAGE_API_SECRET"]);
 * ```
 *
 * @since 0.1.0
 */
export const vonageBindings = (input: VonageBindingsInput): VonageBindings => ({
  ...presentOnly({ VONAGE_FROM: Option.fromNullishOr(input.from) }),
  VONAGE_API_KEY: input.apiKey,
  VONAGE_API_SECRET: input.apiSecret,
});

/**
 * The Vonage bindings read through `effect/Config` on the deploy machine:
 * `VONAGE_API_KEY` and `VONAGE_API_SECRET` (required, the secret redacted)
 * and `VONAGE_FROM` (optional, left out when unset or empty). Fails with a
 * `ConfigError` when a required one is missing.
 *
 * @example
 * ```ts
 * import * as assert from "node:assert";
 * import * as ConfigProvider from "effect/ConfigProvider";
 * import * as Effect from "effect/Effect";
 * import { vonageBindingsConfig } from "@thomasfosterau/effect-connect-alchemy";
 *
 * const env = Effect.runSync(
 *   vonageBindingsConfig.parse(
 *     ConfigProvider.fromEnv({ env: { VONAGE_API_KEY: "abc123", VONAGE_API_SECRET: "secret", VONAGE_FROM: "Acme" } }),
 *   ),
 * );
 * assert.strictEqual(env.VONAGE_FROM, "Acme");
 * ```
 *
 * @since 0.1.0
 */
export const vonageBindingsConfig: Config.Config<VonageBindings> = Config.map(
  Config.all({
    // oxlint-disable-next-line effect/prefer-redacted-config -- the API key is the public half of the credential; its secret is `VONAGE_API_SECRET`, which is redacted
    VONAGE_API_KEY: Config.String("VONAGE_API_KEY"),
    VONAGE_API_SECRET: Config.Redacted("VONAGE_API_SECRET"),
    VONAGE_FROM: Config.option(Config.String("VONAGE_FROM")),
  }),
  ({ VONAGE_FROM, ...required }) => ({ ...presentOnly({ VONAGE_FROM }), ...required }),
);
