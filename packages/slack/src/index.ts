/**
 * `@thomasfosterau/effect-connect-slack` — the Slack chat provider for
 * `@thomasfosterau/effect-connect`: an incoming webhook over `effect/http`
 * with no SDK, a `Redacted` webhook URL checked against Slack's host before
 * any request, a no-op layer for un-provisioned stages and an env-driven
 * resolver that picks between the two.
 *
 * @module index
 * @since 0.1.0
 */

import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import * as Str from "effect/String";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import type * as HttpClient from "effect/http/HttpClient";
import type { ChatService } from "@thomasfosterau/effect-connect";
import { layerChatService, noop } from "./Slack.ts";
import { SlackConfig, type SlackConfigInput } from "./SlackConfig.ts";

/**
 * The Slack sender: the payload mapping, the webhook-URL check, the `ChatService` layer and the no-op transport.
 *
 * @since 0.1.0
 */
export * from "./Slack.ts";
/**
 * The Slack webhook URL and request origin, as a service.
 *
 * @since 0.1.0
 */
export * from "./SlackConfig.ts";

/**
 * The Slack provider from literal configuration, over the `HttpClient` in
 * context (provide `FetchHttpClient.layer` on Workers, browsers and Node).
 *
 * @since 0.1.0
 */
export const layer = (
  config: SlackConfigInput,
): Layer.Layer<ChatService, never, HttpClient.HttpClient> =>
  layerChatService.pipe(Layer.provide(SlackConfig.layer(config)));

/**
 * The Slack provider configured through `effect/Config`
 * (`SLACK_WEBHOOK_URL`, redacted), over the `HttpClient` in context. Fails at
 * layer construction with a `ConfigError` when the variable is unset or
 * empty. On a Worker, {@link resolveTransport} tolerates a missing webhook.
 *
 * @since 0.1.0
 */
export const layerConfig = layerChatService.pipe(Layer.provide(SlackConfig.layerConfig));

/* oxlint-disable effect/prefer-option-over-null -- a Cloudflare-materialised Worker `env`: an unbound secret arrives as a missing key, and a stage can bind it as a plain string or a `Redacted`. `configFromEnv` is the adapter onto `Option`. */
/**
 * The env {@link resolveTransport} reads: the Worker's Slack binding, if any.
 *
 * @since 0.1.0
 */
export interface SlackEnv {
  readonly SLACK_WEBHOOK_URL?: string | Redacted.Redacted<string> | null | undefined;
}
/* oxlint-enable effect/prefer-option-over-null */

/**
 * The provider configuration from a Worker env: `none` unless
 * `SLACK_WEBHOOK_URL` is bound and non-blank (a blank binding is the same
 * case as an absent one). A bound URL that is not Slack's still selects the
 * live sender, whose every send then fails: a misconfiguration is loud, not
 * silently dropped.
 *
 * @since 0.1.0
 */
export const configFromEnv = (env: SlackEnv): Option.Option<SlackConfigInput> =>
  Option.flatMap(Option.fromNullishOr(env.SLACK_WEBHOOK_URL), (raw) => {
    const webhookUrl = Redacted.isRedacted(raw) ? raw : Redacted.make(raw);
    return Str.isEmpty(Redacted.value(webhookUrl).trim())
      ? Option.none()
      : Option.some({ webhookUrl });
  });

/**
 * Pick the transport for a Worker's environment: the live sender (on the
 * platform `fetch`, via `FetchHttpClient`) when a webhook is bound, the
 * logging {@link noop} when it is not.
 *
 * @example
 * ```ts
 * import * as assert from "node:assert";
 * import * as Effect from "effect/Effect";
 * import * as Option from "effect/Option";
 * import { sendChat } from "@thomasfosterau/effect-connect";
 * import { resolveTransport } from "@thomasfosterau/effect-connect-slack";
 *
 * // No webhook bound: the no-op transport, which logs one line and
 * // succeeds without a network call.
 * const result = Effect.runSync(
 *   sendChat({ text: "Deploy finished" }).pipe(Effect.provide(resolveTransport({}))),
 * );
 *
 * assert.ok(Option.isNone(result.id));
 * ```
 *
 * @since 0.1.0
 */
export const resolveTransport = (env: SlackEnv): Layer.Layer<ChatService> =>
  Option.match(configFromEnv(env), {
    onNone: () => noop,
    onSome: (config) => layer(config).pipe(Layer.provide(FetchHttpClient.layer)),
  });
