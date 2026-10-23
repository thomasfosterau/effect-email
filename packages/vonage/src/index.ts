/**
 * `@thomasfosterau/effect-connect-vonage` — the Vonage SMS provider for
 * `@thomasfosterau/effect-connect`: the Messages API over `effect/http` with
 * no SDK, a `Redacted` API secret, a no-op layer for un-provisioned stages
 * and an env-driven resolver that picks between the two.
 *
 * @module index
 * @since 0.1.0
 */

import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import type * as HttpClient from "effect/http/HttpClient";
import {
  boundSecret,
  boundString,
  selectTransport,
  type EnvBinding,
  type EnvSecretBinding,
  type SmsService,
} from "@thomasfosterau/effect-connect";
import { layerSmsService, noop } from "./Vonage.ts";
import { VonageConfig, type VonageConfigInput } from "./VonageConfig.ts";

/**
 * The Vonage sender: the JSON mapping, the `SmsService` layer and the no-op transport.
 *
 * @since 0.1.0
 */
export * from "./Vonage.ts";
/**
 * The Vonage credential, default sender and host, as a service.
 *
 * @since 0.1.0
 */
export * from "./VonageConfig.ts";

/**
 * The Vonage provider from literal configuration, over the `HttpClient` in
 * context (provide `FetchHttpClient.layer` on Workers, browsers and Node).
 *
 * @since 0.1.0
 */
export const layer = (
  config: VonageConfigInput,
): Layer.Layer<SmsService, never, HttpClient.HttpClient> =>
  layerSmsService.pipe(Layer.provide(VonageConfig.layer(config)));

/**
 * The Vonage provider configured through `effect/Config` (see
 * `VonageConfig.layerConfig` for the variables), over the `HttpClient` in
 * context. Fails at layer construction with a `ConfigError` when
 * `VONAGE_API_KEY` or `VONAGE_API_SECRET` is unset or empty. On a Worker,
 * {@link resolveTransport} tolerates missing credentials.
 *
 * @since 0.1.0
 */
export const layerConfig = layerSmsService.pipe(Layer.provide(VonageConfig.layerConfig));

/**
 * The env {@link resolveTransport} reads: the Worker's Vonage bindings, if any.
 *
 * @since 0.1.0
 */
export interface VonageEnv {
  readonly VONAGE_API_KEY?: EnvBinding;
  readonly VONAGE_API_SECRET?: EnvSecretBinding;
  readonly VONAGE_FROM?: EnvBinding;
}

/**
 * The provider configuration from a Worker env: `none` unless both
 * `VONAGE_API_KEY` and `VONAGE_API_SECRET` are bound and non-blank (a blank
 * binding is the same case as an absent one, never a real transport built
 * around an empty credential). A blank `VONAGE_FROM` reads as unset.
 *
 * @since 0.1.0
 */
export const configFromEnv = (env: VonageEnv): Option.Option<VonageConfigInput> =>
  Option.flatMap(boundString(env.VONAGE_API_KEY), (apiKey) =>
    Option.map(boundSecret(env.VONAGE_API_SECRET), (apiSecret) => ({
      apiKey,
      apiSecret,
      from: Option.getOrUndefined(boundString(env.VONAGE_FROM)),
    })),
  );

/**
 * Pick the transport for a Worker's environment: the live sender (on the
 * platform `fetch`, via `FetchHttpClient`) when the Vonage credentials are
 * present, the logging {@link noop} when they are not.
 *
 * @example
 * ```ts
 * import * as assert from "node:assert";
 * import * as Effect from "effect/Effect";
 * import * as Option from "effect/Option";
 * import { sendSms } from "@thomasfosterau/effect-connect";
 * import { resolveTransport } from "@thomasfosterau/effect-connect-vonage";
 *
 * // No credentials bound: the no-op transport, which logs one line and
 * // succeeds without a network call.
 * const result = Effect.runSync(
 *   sendSms({ to: "+61412345678", body: "Your code is 123456" }).pipe(
 *     Effect.provide(resolveTransport({})),
 *   ),
 * );
 *
 * assert.ok(Option.isNone(result.id));
 * ```
 *
 * @since 0.1.0
 */
export const resolveTransport = (env: VonageEnv): Layer.Layer<SmsService> =>
  selectTransport(configFromEnv(env), layer, noop);
