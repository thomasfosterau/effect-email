/**
 * `@thomasfosterau/effect-email-resend` — the Resend provider for
 * `@thomasfosterau/effect-email`: `POST /emails` over `effect/http`
 * with no SDK, a `Redacted` key, a no-op layer for un-provisioned stages and
 * an env-driven resolver that picks between the two.
 *
 * @module index
 */

import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import * as Str from "effect/String";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import type * as HttpClient from "effect/http/HttpClient";
import type { EmailService } from "@thomasfosterau/effect-email";
import { layerEmailService, noop } from "./Resend.ts";
import { ResendConfig, type ResendConfigInput } from "./ResendConfig.ts";

/** The Resend sender: the payload mapping, the `EmailService` layer and the no-op transport. */
export * from "./Resend.ts";
/** The Resend credential and host, as a service. */
export * from "./ResendConfig.ts";

/**
 * The Resend provider from literal configuration, over the `HttpClient` in
 * context (provide `FetchHttpClient.layer` on Workers, browsers and Node).
 */
export const layer = (
  config: ResendConfigInput,
): Layer.Layer<EmailService, never, HttpClient.HttpClient> =>
  layerEmailService.pipe(Layer.provide(ResendConfig.layer(config)));

/**
 * The Resend provider configured through `effect/Config` (`RESEND_API_KEY`,
 * optional `RESEND_BASE_URL`), over the `HttpClient` in context.
 */
export const layerConfig = layerEmailService.pipe(Layer.provide(ResendConfig.layerConfig));

/* oxlint-disable effect/prefer-option-over-null -- a Cloudflare-materialised Worker `env`: the property is materialised by the platform from a bound secret, so an absent one arrives as a missing key, and a stage can bind it as a plain string (a local `.dev.vars`) or a `Redacted` (alchemy wraps it). There is nothing to construct an `Option` from without an adapter over every `env` read; `apiKeyFromEnv` is that adapter. */
/** The env {@link resolveTransport} reads: the Worker's `RESEND_API_KEY` binding, if any. */
export interface ResendEnv {
  readonly RESEND_API_KEY?: string | Redacted.Redacted<string> | null | undefined;
}
/* oxlint-enable effect/prefer-option-over-null */

/**
 * The credential from a Worker env, normalised: `none` when the binding is
 * absent, `null`, or blank (a stage can bind `""` by hand, and a truthiness
 * check is what makes that the same case as "unset" rather than a real
 * transport built around an empty bearer token).
 */
export const apiKeyFromEnv = (env: ResendEnv): Option.Option<Redacted.Redacted<string>> =>
  Option.flatMap(Option.fromNullishOr(env.RESEND_API_KEY), (raw) => {
    const apiKey = Redacted.isRedacted(raw) ? raw : Redacted.make(raw);
    return Str.isEmpty(Redacted.value(apiKey).trim()) ? Option.none() : Option.some(apiKey);
  });

/**
 * Pick the transport for a Worker's environment: the live sender (on the
 * platform `fetch`, via `FetchHttpClient`) when `RESEND_API_KEY` is present,
 * the logging {@link noop} when it is not. One call site per Worker, so the
 * fallback cannot be forgotten at one of two.
 *
 * @example
 * ```ts
 * import * as Effect from "effect/Effect";
 * import * as Option from "effect/Option";
 * import { send } from "@thomasfosterau/effect-email";
 * import { resolveTransport } from "@thomasfosterau/effect-email-resend";
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
 */
export const resolveTransport = (env: ResendEnv): Layer.Layer<EmailService> =>
  Option.match(apiKeyFromEnv(env), {
    onNone: () => noop,
    onSome: (apiKey) => layer({ apiKey }).pipe(Layer.provide(FetchHttpClient.layer)),
  });
