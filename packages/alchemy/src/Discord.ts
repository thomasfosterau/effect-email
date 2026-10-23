/**
 * The Worker binding `@thomasfosterau/effect-connect-discord` reads
 * (`DiscordEnv`): the webhook URL, as a secret (the URL is the credential).
 *
 * @module Discord
 * @since 0.1.0
 */

import * as Config from "effect/Config";
import type * as Redacted from "effect/Redacted";

/**
 * What {@link discordBindings} takes.
 *
 * @since 0.1.0
 */
export interface DiscordBindingsInput {
  /** The Discord webhook URL. */
  readonly webhookUrl: Redacted.Redacted<string>;
}

/**
 * The Discord bindings for a Worker's `env`: `DISCORD_WEBHOOK_URL`, deployed as a
 * secret because it is `Redacted`.
 *
 * @since 0.1.0
 */
export interface DiscordBindings {
  readonly DISCORD_WEBHOOK_URL: Redacted.Redacted<string>;
}

/**
 * The Discord bindings from literal values, to spread into a Worker's `env`.
 *
 * @example
 * ```ts
 * import * as assert from "node:assert";
 * import * as Redacted from "effect/Redacted";
 * import { discordBindings } from "@thomasfosterau/effect-connect-alchemy";
 *
 * const env = discordBindings({ webhookUrl: Redacted.make("https://discord.com/api/webhooks/1/abc") });
 * assert.strictEqual(Redacted.value(env.DISCORD_WEBHOOK_URL), "https://discord.com/api/webhooks/1/abc");
 * ```
 *
 * @since 0.1.0
 */
export const discordBindings = (input: DiscordBindingsInput): DiscordBindings => ({
  DISCORD_WEBHOOK_URL: input.webhookUrl,
});

/**
 * The Discord bindings read through `effect/Config` on the deploy machine:
 * `DISCORD_WEBHOOK_URL` (required, redacted). Fails with a `ConfigError`
 * when it is unset or empty.
 *
 * @example
 * ```ts
 * import * as assert from "node:assert";
 * import * as ConfigProvider from "effect/ConfigProvider";
 * import * as Effect from "effect/Effect";
 * import * as Redacted from "effect/Redacted";
 * import { discordBindingsConfig } from "@thomasfosterau/effect-connect-alchemy";
 *
 * const env = Effect.runSync(
 *   discordBindingsConfig.parse(ConfigProvider.fromEnv({ env: { DISCORD_WEBHOOK_URL: "https://discord.com/api/webhooks/1/abc" } })),
 * );
 * assert.strictEqual(Redacted.value(env.DISCORD_WEBHOOK_URL), "https://discord.com/api/webhooks/1/abc");
 * ```
 *
 * @since 0.1.0
 */
export const discordBindingsConfig: Config.Config<DiscordBindings> = Config.all({
  DISCORD_WEBHOOK_URL: Config.Redacted("DISCORD_WEBHOOK_URL"),
});
