/**
 * `@thomasfosterau/effect-connect-discord` — the Discord chat provider for
 * `@thomasfosterau/effect-connect`: a channel webhook over `effect/http`
 * with no SDK, a `Redacted` webhook URL checked against Discord's host before
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
import { layerChatService, noop } from "./Discord.ts";
import { DiscordConfig, type DiscordConfigInput } from "./DiscordConfig.ts";

/**
 * The Discord sender: the payload mapping, the webhook-URL check, the content limit, the `ChatService` layer and the no-op transport.
 *
 * @since 0.1.0
 */
export * from "./Discord.ts";
/**
 * The Discord webhook URL and request origin, as a service.
 *
 * @since 0.1.0
 */
export * from "./DiscordConfig.ts";

/**
 * The Discord provider from literal configuration, over the `HttpClient` in
 * context (provide `FetchHttpClient.layer` on Workers, browsers and Node).
 *
 * @since 0.1.0
 */
export const layer = (
  config: DiscordConfigInput,
): Layer.Layer<ChatService, never, HttpClient.HttpClient> =>
  layerChatService.pipe(Layer.provide(DiscordConfig.layer(config)));

/**
 * The Discord provider configured through `effect/Config`
 * (`DISCORD_WEBHOOK_URL`, redacted), over the `HttpClient` in context. Fails at
 * layer construction with a `ConfigError` when the variable is unset or
 * empty. On a Worker, {@link resolveTransport} tolerates a missing webhook.
 *
 * @since 0.1.0
 */
export const layerConfig = layerChatService.pipe(Layer.provide(DiscordConfig.layerConfig));

/* oxlint-disable effect/prefer-option-over-null -- a Cloudflare-materialised Worker `env`: an unbound secret arrives as a missing key, and a stage can bind it as a plain string or a `Redacted`. `configFromEnv` is the adapter onto `Option`. */
/**
 * The env {@link resolveTransport} reads: the Worker's Discord binding, if any.
 *
 * @since 0.1.0
 */
export interface DiscordEnv {
  readonly DISCORD_WEBHOOK_URL?: string | Redacted.Redacted<string> | null | undefined;
}
/* oxlint-enable effect/prefer-option-over-null */

/**
 * The provider configuration from a Worker env: `none` unless
 * `DISCORD_WEBHOOK_URL` is bound and non-blank (a blank binding is the same
 * case as an absent one). A bound URL that is not Discord's still selects the
 * live sender, whose every send then fails: a misconfiguration is loud, not
 * silently dropped.
 *
 * @since 0.1.0
 */
export const configFromEnv = (env: DiscordEnv): Option.Option<DiscordConfigInput> =>
  Option.flatMap(Option.fromNullishOr(env.DISCORD_WEBHOOK_URL), (raw) => {
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
 * import { resolveTransport } from "@thomasfosterau/effect-connect-discord";
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
export const resolveTransport = (env: DiscordEnv): Layer.Layer<ChatService> =>
  Option.match(configFromEnv(env), {
    onNone: () => noop,
    onSome: (config) => layer(config).pipe(Layer.provide(FetchHttpClient.layer)),
  });
