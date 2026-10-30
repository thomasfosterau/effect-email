/**
 * The Twilio credential, account, default senders and host, as a service with
 * two constructors: a literal (`layer`) and one read from `effect/Config`
 * (`layerConfig`).
 *
 * @module TwilioConfig
 * @since 0.1.0
 */

import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import type * as Redacted from "effect/Redacted";

/**
 * Twilio's REST API host, as a compile-time constant. A hard-coded literal
 * rather than anything derived from input (SEC-SSRF-001 in the consuming
 * applications); `baseUrl` exists for a stub server in a test, never for
 * request input.
 *
 * @since 0.1.0
 */
export const DEFAULT_BASE_URL = "https://api.twilio.com";

/**
 * What {@link TwilioConfig.layer} takes.
 *
 * @since 0.1.0
 */
export interface TwilioConfigInput {
  /** The account SID (`AC` + 32 hex digits). It is a URL path segment, so a send refuses any other shape. */
  readonly accountSid: string;
  /**
   * The password half of HTTP Basic auth: the account's auth token, or an
   * API key's secret when {@link TwilioConfigInput.apiKeySid} is set. Wrap
   * with `Redacted.make(...)` or read it via `Config.redacted(...)`.
   */
  readonly authToken: Redacted.Redacted;
  // oxlint-disable-next-line effect/prefer-option-over-null -- consumer-facing config input: an omitted key IS the default, and asking every caller to spell `Option.none()` buys nothing
  readonly apiKeySid?: string | undefined;
  /** The default SMS sender for an SMS without its own `from`. Never used for WhatsApp. */
  // oxlint-disable-next-line effect/prefer-option-over-null -- as above
  readonly from?: string | undefined;
  /**
   * The default WhatsApp sender for a WhatsApp message without its own
   * `from`: an E.164 number registered as a WhatsApp sender, with or without
   * the `whatsapp:` prefix. Separate from {@link TwilioConfigInput.from}
   * because an SMS sender (an alphanumeric ID, a short code) is not a
   * WhatsApp number.
   */
  // oxlint-disable-next-line effect/prefer-option-over-null -- as above
  readonly whatsappFrom?: string | undefined;
  /**
   * A Messaging Service SID (`MG…`): Twilio then picks the sender from the
   * service's pool. Sent with SMS and WhatsApp messages alike; a WhatsApp
   * send through it needs a WhatsApp sender in that pool.
   */
  // oxlint-disable-next-line effect/prefer-option-over-null -- as above
  readonly messagingServiceSid?: string | undefined;
  /** The API host, without a trailing slash. Defaults to {@link DEFAULT_BASE_URL}. */
  // oxlint-disable-next-line effect/prefer-option-over-null -- as above
  readonly baseUrl?: string | undefined;
}

/**
 * The Twilio configuration as a service. `username` is the Basic-auth user:
 * the API key SID when one is configured, else the account SID.
 *
 * @since 0.1.0
 */
export class TwilioConfig extends Context.Service<
  TwilioConfig,
  {
    readonly accountSid: string;
    readonly username: string;
    readonly authToken: Redacted.Redacted;
    readonly from: Option.Option<string>;
    readonly whatsappFrom: Option.Option<string>;
    readonly messagingServiceSid: Option.Option<string>;
    readonly baseUrl: string;
  }
>()("@thomasfosterau/effect-connect-twilio/TwilioConfig") {
  /**
   * A configuration from literal values.
   *
   * @since 0.1.0
   */
  static readonly layer = (config: TwilioConfigInput): Layer.Layer<TwilioConfig> =>
    Layer.succeed(TwilioConfig, {
      accountSid: config.accountSid,
      username: config.apiKeySid ?? config.accountSid,
      authToken: config.authToken,
      from: Option.fromNullishOr(config.from),
      whatsappFrom: Option.fromNullishOr(config.whatsappFrom),
      messagingServiceSid: Option.fromNullishOr(config.messagingServiceSid),
      baseUrl: config.baseUrl ?? DEFAULT_BASE_URL,
    });

  /**
   * A configuration read through `effect/Config`: `TWILIO_ACCOUNT_SID` and
   * `TWILIO_AUTH_TOKEN` (required, the token redacted), and the optional
   * `TWILIO_API_KEY_SID`, `TWILIO_FROM`, `TWILIO_WHATSAPP_FROM`,
   * `TWILIO_MESSAGING_SERVICE_SID` and `TWILIO_BASE_URL`. Fails with a `ConfigError` when a required variable
   * is unset or empty (an empty variable reads as missing); an empty
   * optional one reads as unset.
   *
   * @since 0.1.0
   */
  static readonly layerConfig = Layer.effect(
    TwilioConfig,
    Effect.gen(function* () {
      const accountSid = yield* Config.String("TWILIO_ACCOUNT_SID");
      const authToken = yield* Config.Redacted("TWILIO_AUTH_TOKEN");
      // oxlint-disable-next-line effect/prefer-redacted-config -- an API key SID (`SK…`) is the public username half of the credential, like the account SID; its secret is `TWILIO_AUTH_TOKEN`, which is redacted
      const apiKeySid = yield* Config.option(Config.String("TWILIO_API_KEY_SID"));
      const from = yield* Config.option(Config.String("TWILIO_FROM"));
      const whatsappFrom = yield* Config.option(Config.String("TWILIO_WHATSAPP_FROM"));
      const messagingServiceSid = yield* Config.option(
        Config.String("TWILIO_MESSAGING_SERVICE_SID"),
      );
      const baseUrl = yield* Config.String("TWILIO_BASE_URL").pipe(
        Config.withDefault(DEFAULT_BASE_URL),
      );
      return {
        accountSid,
        username: Option.getOrElse(apiKeySid, () => accountSid),
        authToken,
        from,
        whatsappFrom,
        messagingServiceSid,
        baseUrl,
      };
    }),
  );
}
