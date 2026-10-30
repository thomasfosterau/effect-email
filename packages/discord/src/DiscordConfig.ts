/**
 * The Discord webhook URL (the credential) and the request origin, as a
 * service with two constructors: a literal (`layer`) and one read from
 * `effect/Config` (`layerConfig`).
 *
 * @module DiscordConfig
 * @since 0.1.0
 */

import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type * as Redacted from "effect/Redacted";

/**
 * Discord's API origin, as a compile-time constant. Every request goes to
 * this origin plus the path of the configured webhook URL, once that URL has
 * been checked to be a `https://discord.com/api/webhooks/<id>/<token>` URL
 * (or the legacy `discordapp.com` spelling). `baseUrl` replaces the origin
 * for a stub server in a test, never for request input (SEC-SSRF-001 in the
 * consuming applications).
 *
 * @since 0.1.0
 */
export const DEFAULT_BASE_URL = "https://discord.com";

/**
 * What {@link DiscordConfig.layer} takes.
 *
 * @since 0.1.0
 */
export interface DiscordConfigInput {
  /**
   * The webhook URL Discord issued
   * (`https://discord.com/api/webhooks/<id>/<token>`). The URL **is** the
   * credential — anyone holding it can post to the channel, or delete the
   * webhook — so wrap it with `Redacted.make(...)` or read it via
   * `Config.redacted(...)`.
   */
  readonly webhookUrl: Redacted.Redacted;
  /**
   * The origin requests go to, without a trailing slash. Defaults to
   * {@link DEFAULT_BASE_URL}. Only the origin is replaced: the webhook URL
   * is still checked against Discord's host, and its path is what is sent.
   * For a stub server in a test, never for request input.
   */
  // oxlint-disable-next-line effect/prefer-option-over-null -- consumer-facing config input: an omitted key IS the default, and asking every caller to spell `Option.none()` buys nothing
  readonly baseUrl?: string | undefined;
  /**
   * Let Discord ping the mentions in a message's text (`@everyone`, `@here`,
   * roles and users). Defaults to `false`: every send carries
   * `allowed_mentions: { parse: [] }`, so a message assembled from user
   * input pings nobody. Set it only when every message's text is trusted.
   * There is no environment variable for it: `layerConfig` and
   * `resolveTransport` always suppress mentions.
   */
  // oxlint-disable-next-line effect/prefer-option-over-null -- consumer-facing config input: an omitted key IS the safe default, and asking every caller to spell `Option.none()` buys nothing
  readonly allowMentions?: boolean | undefined;
}

/**
 * The Discord configuration as a service.
 *
 * @since 0.1.0
 */
export class DiscordConfig extends Context.Service<
  DiscordConfig,
  {
    readonly webhookUrl: Redacted.Redacted;
    readonly baseUrl: string;
    readonly allowMentions: boolean;
  }
>()("@thomasfosterau/effect-connect-discord/DiscordConfig") {
  /**
   * A configuration from literal values.
   *
   * @since 0.1.0
   */
  static readonly layer = (config: DiscordConfigInput): Layer.Layer<DiscordConfig> =>
    Layer.succeed(DiscordConfig, {
      webhookUrl: config.webhookUrl,
      baseUrl: config.baseUrl ?? DEFAULT_BASE_URL,
      allowMentions: config.allowMentions ?? false,
    });

  /**
   * A configuration read through `effect/Config`: `DISCORD_WEBHOOK_URL`
   * (required, redacted). Fails with a `ConfigError` when it is unset or
   * empty. There is deliberately no variable for `baseUrl`: an environment
   * that could move the origin could send the webhook's token to any host.
   * Mentions stay suppressed (`allowMentions: false`).
   *
   * @since 0.1.0
   */
  static readonly layerConfig = Layer.effect(
    DiscordConfig,
    Effect.gen(function* () {
      const webhookUrl = yield* Config.Redacted("DISCORD_WEBHOOK_URL");
      return { webhookUrl, baseUrl: DEFAULT_BASE_URL, allowMentions: false };
    }),
  );
}
