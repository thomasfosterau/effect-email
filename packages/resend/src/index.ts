/**
 * `@thomasfosterau/effect-connect-resend` — the Resend provider for
 * `@thomasfosterau/effect-connect`: `POST /emails` over `effect/http`
 * with no SDK, a `Redacted` key, a no-op layer for un-provisioned stages and
 * an env-driven resolver that picks between the two.
 *
 * @module index
 * @since 0.1.0
 */

import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import type * as HttpClient from "effect/http/HttpClient";
import {
  boundSecret,
  selectTransport,
  type EmailService,
  type EnvSecretBinding,
} from "@thomasfosterau/effect-connect";
import { layerEmailService, noop } from "./Resend.ts";
import { ResendConfig, type ResendConfigInput } from "./ResendConfig.ts";

/**
 * The Resend sender: the payload mapping, the `EmailService` layer and the no-op transport.
 *
 * @since 0.1.0
 */
export * from "./Resend.ts";
/**
 * The Resend credential and host, as a service.
 *
 * @since 0.1.0
 */
export * from "./ResendConfig.ts";

/**
 * The Resend provider from literal configuration, over the `HttpClient` in
 * context (provide `FetchHttpClient.layer` on Workers, browsers and Node).
 *
 * @since 0.1.0
 */
export const layer = (
  config: ResendConfigInput,
): Layer.Layer<EmailService, never, HttpClient.HttpClient> =>
  layerEmailService.pipe(Layer.provide(ResendConfig.layer(config)));

/**
 * The Resend provider configured through `effect/Config` (`RESEND_API_KEY`,
 * optional `RESEND_BASE_URL`), over the `HttpClient` in context. Fails at
 * layer construction with a `ConfigError` when `RESEND_API_KEY` is unset or
 * empty (an empty variable reads as missing); an empty `RESEND_BASE_URL`
 * falls back to the default host. On a Worker, {@link resolveTransport}
 * tolerates a missing key.
 *
 * @since 0.1.0
 */
export const layerConfig = layerEmailService.pipe(Layer.provide(ResendConfig.layerConfig));

/**
 * The env {@link resolveTransport} reads: the Worker's `RESEND_API_KEY` binding, if any.
 *
 * @since 0.1.0
 */
export interface ResendEnv {
  readonly RESEND_API_KEY?: EnvSecretBinding;
}

/**
 * The credential from a Worker env, normalised: `none` when the binding is
 * absent, `null`, or blank (a stage can bind `""` by hand, and a truthiness
 * check is what makes that the same case as "unset" rather than a real
 * transport built around an empty bearer token).
 *
 * @since 0.1.0
 */
export const apiKeyFromEnv = (env: ResendEnv): Option.Option<Redacted.Redacted> =>
  boundSecret(env.RESEND_API_KEY);

/**
 * Pick the transport for a Worker's environment: the live sender (on the
 * platform `fetch`, via `FetchHttpClient`) when `RESEND_API_KEY` is present,
 * the logging {@link noop} when it is not. One call site per Worker, so the
 * fallback cannot be forgotten at one of two.
 *
 * @example
 * ```ts
 * import * as assert from "node:assert";
 * import * as Effect from "effect/Effect";
 * import * as Option from "effect/Option";
 * import { send } from "@thomasfosterau/effect-connect";
 * import { resolveTransport } from "@thomasfosterau/effect-connect-resend";
 *
 * // No `RESEND_API_KEY` bound (a blank one counts as unbound): the no-op
 * // transport, which logs the subject and succeeds without a network call.
 * const result = Effect.runSync(
 *   send({
 *     from: { email: "noreply@example.com" },
 *     to: [{ email: "reader@example.com" }],
 *     subject: "Welcome",
 *   }).pipe(Effect.provide(resolveTransport({ RESEND_API_KEY: "  " }))),
 * );
 *
 * assert.ok(Option.isNone(result.id));
 * ```
 *
 * @since 0.1.0
 */
export const resolveTransport = (env: ResendEnv): Layer.Layer<EmailService> =>
  selectTransport(apiKeyFromEnv(env), (apiKey) => layer({ apiKey }), noop);
