/**
 * The Worker bindings `@thomasfosterau/effect-connect-sendgrid`'s
 * `layerConfig` reads: the API key, as a secret.
 *
 * @module SendGrid
 * @since 0.1.0
 */

import * as Config from "effect/Config";
import type * as Redacted from "effect/Redacted";

/**
 * What {@link sendGridBindings} takes.
 *
 * @since 0.1.0
 */
export interface SendGridBindingsInput {
  /** The SendGrid API key. */
  readonly apiKey: Redacted.Redacted;
}

/**
 * The SendGrid bindings for a Worker's `env`: `SENDGRID_API_KEY`, deployed
 * as a secret because it is `Redacted`.
 *
 * @since 0.1.0
 */
export interface SendGridBindings {
  readonly SENDGRID_API_KEY: Redacted.Redacted;
}

/**
 * The SendGrid bindings from literal values, to spread into a Worker's
 * `env`.
 *
 * @example
 * ```ts
 * import * as assert from "node:assert";
 * import * as Redacted from "effect/Redacted";
 * import { sendGridBindings } from "@thomasfosterau/effect-connect-alchemy";
 *
 * const env = sendGridBindings({ apiKey: Redacted.make("SG.123") });
 * assert.strictEqual(Redacted.value(env.SENDGRID_API_KEY), "SG.123");
 * ```
 *
 * @since 0.1.0
 */
export const sendGridBindings = (input: SendGridBindingsInput): SendGridBindings => ({
  SENDGRID_API_KEY: input.apiKey,
});

/**
 * The SendGrid bindings read through `effect/Config` on the deploy machine:
 * `SENDGRID_API_KEY` (required, redacted). Fails with a `ConfigError` when
 * it is unset or empty.
 *
 * @example
 * ```ts
 * import * as assert from "node:assert";
 * import * as ConfigProvider from "effect/ConfigProvider";
 * import * as Effect from "effect/Effect";
 * import * as Redacted from "effect/Redacted";
 * import { sendGridBindingsConfig } from "@thomasfosterau/effect-connect-alchemy";
 *
 * const env = Effect.runSync(
 *   sendGridBindingsConfig.parse(ConfigProvider.fromEnv({ env: { SENDGRID_API_KEY: "SG.123" } })),
 * );
 * assert.strictEqual(Redacted.value(env.SENDGRID_API_KEY), "SG.123");
 * ```
 *
 * @since 0.1.0
 */
export const sendGridBindingsConfig: Config.Config<SendGridBindings> = Config.all({
  SENDGRID_API_KEY: Config.Redacted("SENDGRID_API_KEY"),
});
