/**
 * The Worker binding `@thomasfosterau/effect-connect-slack` reads
 * (`SlackEnv`): the webhook URL, as a secret (the URL is the credential).
 *
 * @module Slack
 * @since 0.1.0
 */

import * as Config from "effect/Config";
import type * as Redacted from "effect/Redacted";

/**
 * What {@link slackBindings} takes.
 *
 * @since 0.1.0
 */
export interface SlackBindingsInput {
  /** The Slack webhook URL. */
  readonly webhookUrl: Redacted.Redacted;
}

/**
 * The Slack bindings for a Worker's `env`: `SLACK_WEBHOOK_URL`, deployed as a
 * secret because it is `Redacted`.
 *
 * @since 0.1.0
 */
export interface SlackBindings {
  readonly SLACK_WEBHOOK_URL: Redacted.Redacted;
}

/**
 * The Slack bindings from literal values, to spread into a Worker's `env`.
 *
 * @example
 * ```ts
 * import * as assert from "node:assert";
 * import * as Redacted from "effect/Redacted";
 * import { slackBindings } from "@thomasfosterau/effect-connect-alchemy";
 *
 * const env = slackBindings({ webhookUrl: Redacted.make("https://hooks.slack.com/services/T000/B000/XXXX") });
 * assert.strictEqual(Redacted.value(env.SLACK_WEBHOOK_URL), "https://hooks.slack.com/services/T000/B000/XXXX");
 * ```
 *
 * @since 0.1.0
 */
export const slackBindings = (input: SlackBindingsInput): SlackBindings => ({
  SLACK_WEBHOOK_URL: input.webhookUrl,
});

/**
 * The Slack bindings read through `effect/Config` on the deploy machine:
 * `SLACK_WEBHOOK_URL` (required, redacted). Fails with a `ConfigError`
 * when it is unset or empty.
 *
 * @example
 * ```ts
 * import * as assert from "node:assert";
 * import * as ConfigProvider from "effect/ConfigProvider";
 * import * as Effect from "effect/Effect";
 * import * as Redacted from "effect/Redacted";
 * import { slackBindingsConfig } from "@thomasfosterau/effect-connect-alchemy";
 *
 * const env = Effect.runSync(
 *   slackBindingsConfig.parse(ConfigProvider.fromEnv({ env: { SLACK_WEBHOOK_URL: "https://hooks.slack.com/services/T000/B000/XXXX" } })),
 * );
 * assert.strictEqual(Redacted.value(env.SLACK_WEBHOOK_URL), "https://hooks.slack.com/services/T000/B000/XXXX");
 * ```
 *
 * @since 0.1.0
 */
export const slackBindingsConfig: Config.Config<SlackBindings> = Config.all({
  SLACK_WEBHOOK_URL: Config.Redacted("SLACK_WEBHOOK_URL"),
});
