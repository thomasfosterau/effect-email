/**
 * The Slack incoming-webhook URL (the credential) and the request origin, as
 * a service with two constructors: a literal (`layer`) and one read from
 * `effect/Config` (`layerConfig`).
 *
 * @module SlackConfig
 * @since 0.1.0
 */

import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type * as Redacted from "effect/Redacted";

/**
 * Slack's incoming-webhook origin, as a compile-time constant. Every request
 * goes to this origin plus the path of the configured webhook URL, once that
 * URL has been checked to be an `https://hooks.slack.com/services/…` URL.
 * `baseUrl` replaces the origin for a stub server in a test, never for
 * request input (SEC-SSRF-001 in the consuming applications).
 *
 * @since 0.1.0
 */
export const DEFAULT_BASE_URL = "https://hooks.slack.com";

/**
 * What {@link SlackConfig.layer} takes.
 *
 * @since 0.1.0
 */
export interface SlackConfigInput {
  /**
   * The incoming-webhook URL Slack issued
   * (`https://hooks.slack.com/services/T…/B…/…`). The URL **is** the
   * credential — anyone holding it can post to the channel — so wrap it with
   * `Redacted.make(...)` or read it via `Config.redacted(...)`.
   */
  readonly webhookUrl: Redacted.Redacted;
  /**
   * The origin requests go to, without a trailing slash. Defaults to
   * {@link DEFAULT_BASE_URL}. Only the origin is replaced: the webhook URL
   * is still checked against Slack's host, and its path is what is sent.
   * For a stub server in a test, never for request input.
   */
  // oxlint-disable-next-line effect/prefer-option-over-null -- consumer-facing config input: an omitted key IS the default, and asking every caller to spell `Option.none()` buys nothing
  readonly baseUrl?: string | undefined;
  /**
   * Let `<!channel>`, `<!here>`, `<!everyone>` and `<!subteam^…>` in a
   * message's text ping as Slack mentions. Defaults to `false`: they are
   * escaped, so a message assembled from user input cannot ping a whole
   * channel or user group. Set it only when every message's text is trusted.
   * There is no environment variable for it: `layerConfig` and
   * `resolveTransport` always escape.
   */
  // oxlint-disable-next-line effect/prefer-option-over-null -- consumer-facing config input: an omitted key IS the safe default, and asking every caller to spell `Option.none()` buys nothing
  readonly allowMentions?: boolean | undefined;
}

/**
 * The Slack configuration as a service.
 *
 * @since 0.1.0
 */
export class SlackConfig extends Context.Service<
  SlackConfig,
  {
    readonly webhookUrl: Redacted.Redacted;
    readonly baseUrl: string;
    readonly allowMentions: boolean;
  }
>()("@thomasfosterau/effect-connect-slack/SlackConfig") {
  /**
   * A configuration from literal values.
   *
   * @since 0.1.0
   */
  static readonly layer = (config: SlackConfigInput): Layer.Layer<SlackConfig> =>
    Layer.succeed(SlackConfig, {
      webhookUrl: config.webhookUrl,
      baseUrl: config.baseUrl ?? DEFAULT_BASE_URL,
      allowMentions: config.allowMentions ?? false,
    });

  /**
   * A configuration read through `effect/Config`: `SLACK_WEBHOOK_URL`
   * (required, redacted). Fails with a `ConfigError` when it is unset or
   * empty. There is deliberately no variable for `baseUrl`: an environment
   * that could move the origin could send the webhook's token to any host.
   * Mentions stay escaped (`allowMentions: false`).
   *
   * @since 0.1.0
   */
  static readonly layerConfig = Layer.effect(
    SlackConfig,
    Effect.gen(function* () {
      const webhookUrl = yield* Config.Redacted("SLACK_WEBHOOK_URL");
      return { webhookUrl, baseUrl: DEFAULT_BASE_URL, allowMentions: false };
    }),
  );
}
