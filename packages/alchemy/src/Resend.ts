/**
 * The Worker bindings `@thomasfosterau/effect-connect-resend` reads
 * (`ResendEnv`): the API key, as a secret.
 *
 * @module Resend
 * @since 0.1.0
 */

import * as Config from "effect/Config";
import type * as Redacted from "effect/Redacted";

/**
 * What {@link resendBindings} takes.
 *
 * @since 0.1.0
 */
export interface ResendBindingsInput {
  /** The Resend API key. */
  readonly apiKey: Redacted.Redacted<string>;
}

/**
 * The Resend bindings for a Worker's `env`: `RESEND_API_KEY`, deployed as a
 * secret because it is `Redacted`.
 *
 * @since 0.1.0
 */
export interface ResendBindings {
  readonly RESEND_API_KEY: Redacted.Redacted<string>;
}

/**
 * The Resend bindings from literal values, to spread into a Worker's `env`.
 *
 * @example
 * ```ts
 * import * as assert from "node:assert";
 * import * as Redacted from "effect/Redacted";
 * import { resendBindings } from "@thomasfosterau/effect-connect-alchemy";
 *
 * const env = resendBindings({ apiKey: Redacted.make("re_123") });
 * assert.strictEqual(Redacted.value(env.RESEND_API_KEY), "re_123");
 * ```
 *
 * @since 0.1.0
 */
export const resendBindings = (input: ResendBindingsInput): ResendBindings => ({
  RESEND_API_KEY: input.apiKey,
});

/**
 * The Resend bindings read through `effect/Config` on the deploy machine:
 * `RESEND_API_KEY` (required, redacted). Fails with a `ConfigError` when it
 * is unset or empty, so a deploy never ships a Worker without its key.
 *
 * @example
 * ```ts
 * import * as assert from "node:assert";
 * import * as ConfigProvider from "effect/ConfigProvider";
 * import * as Effect from "effect/Effect";
 * import * as Redacted from "effect/Redacted";
 * import { resendBindingsConfig } from "@thomasfosterau/effect-connect-alchemy";
 *
 * const env = Effect.runSync(
 *   resendBindingsConfig.parse(ConfigProvider.fromEnv({ env: { RESEND_API_KEY: "re_123" } })),
 * );
 * assert.strictEqual(Redacted.value(env.RESEND_API_KEY), "re_123");
 * ```
 *
 * @since 0.1.0
 */
export const resendBindingsConfig: Config.Config<ResendBindings> = Config.all({
  RESEND_API_KEY: Config.Redacted("RESEND_API_KEY"),
});
