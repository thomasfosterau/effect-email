/**
 * `@thomasfosterau/effect-connect-twilio` — the Twilio SMS provider for
 * `@thomasfosterau/effect-connect`: Programmable Messaging over
 * `effect/http` with no SDK, a `Redacted` auth token, a no-op layer for
 * un-provisioned stages and an env-driven resolver that picks between the two.
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
import type { SmsService } from "@thomasfosterau/effect-connect";
import { layerSmsService, noop } from "./Twilio.ts";
import { TwilioConfig, type TwilioConfigInput } from "./TwilioConfig.ts";

/**
 * The Twilio sender: the form mapping, the `SmsService` layer and the no-op transport.
 *
 * @since 0.1.0
 */
export * from "./Twilio.ts";
/**
 * The Twilio credential, account, default sender and host, as a service.
 *
 * @since 0.1.0
 */
export * from "./TwilioConfig.ts";

/**
 * The Twilio provider from literal configuration, over the `HttpClient` in
 * context (provide `FetchHttpClient.layer` on Workers, browsers and Node).
 *
 * @since 0.1.0
 */
export const layer = (
  config: TwilioConfigInput,
): Layer.Layer<SmsService, never, HttpClient.HttpClient> =>
  layerSmsService.pipe(Layer.provide(TwilioConfig.layer(config)));

/**
 * The Twilio provider configured through `effect/Config` (see
 * `TwilioConfig.layerConfig` for the variables), over the `HttpClient` in
 * context. Fails at layer construction with a `ConfigError` when
 * `TWILIO_ACCOUNT_SID` or `TWILIO_AUTH_TOKEN` is unset or empty. On a
 * Worker, {@link resolveTransport} tolerates missing credentials.
 *
 * @since 0.1.0
 */
export const layerConfig = layerSmsService.pipe(Layer.provide(TwilioConfig.layerConfig));

/* oxlint-disable effect/prefer-option-over-null -- a Cloudflare-materialised Worker `env`: an unbound secret arrives as a missing key, and a stage can bind it as a plain string or a `Redacted`. `configFromEnv` is the adapter onto `Option`. */
/**
 * The env {@link resolveTransport} reads: the Worker's Twilio bindings, if any.
 *
 * @since 0.1.0
 */
export interface TwilioEnv {
  readonly TWILIO_ACCOUNT_SID?: string | null | undefined;
  readonly TWILIO_AUTH_TOKEN?: string | Redacted.Redacted<string> | null | undefined;
  readonly TWILIO_API_KEY_SID?: string | null | undefined;
  readonly TWILIO_FROM?: string | null | undefined;
  readonly TWILIO_MESSAGING_SERVICE_SID?: string | null | undefined;
}

/** A binding as `some` when present and non-blank. */
const bound = (value: string | null | undefined): Option.Option<string> =>
  Option.filter(Option.fromNullishOr(value), (raw) => Str.isNonEmpty(raw.trim()));
/* oxlint-enable effect/prefer-option-over-null */

/**
 * The provider configuration from a Worker env: `none` unless both
 * `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` are bound and non-blank (a
 * blank binding is the same case as an absent one, never a real transport
 * built around an empty credential). Blank optional bindings read as unset.
 *
 * @since 0.1.0
 */
export const configFromEnv = (env: TwilioEnv): Option.Option<TwilioConfigInput> =>
  Option.flatMap(bound(env.TWILIO_ACCOUNT_SID), (accountSid) =>
    Option.flatMap(Option.fromNullishOr(env.TWILIO_AUTH_TOKEN), (raw) => {
      const authToken = Redacted.isRedacted(raw) ? raw : Redacted.make(raw);
      return Str.isEmpty(Redacted.value(authToken).trim())
        ? Option.none()
        : Option.some({
            accountSid,
            authToken,
            apiKeySid: Option.getOrUndefined(bound(env.TWILIO_API_KEY_SID)),
            from: Option.getOrUndefined(bound(env.TWILIO_FROM)),
            messagingServiceSid: Option.getOrUndefined(bound(env.TWILIO_MESSAGING_SERVICE_SID)),
          });
    }),
  );

/**
 * Pick the transport for a Worker's environment: the live sender (on the
 * platform `fetch`, via `FetchHttpClient`) when the Twilio credentials are
 * present, the logging {@link noop} when they are not.
 *
 * @example
 * ```ts
 * import * as assert from "node:assert";
 * import * as Effect from "effect/Effect";
 * import * as Option from "effect/Option";
 * import { sendSms } from "@thomasfosterau/effect-connect";
 * import { resolveTransport } from "@thomasfosterau/effect-connect-twilio";
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
export const resolveTransport = (env: TwilioEnv): Layer.Layer<SmsService> =>
  Option.match(configFromEnv(env), {
    onNone: () => noop,
    onSome: (config) => layer(config).pipe(Layer.provide(FetchHttpClient.layer)),
  });
