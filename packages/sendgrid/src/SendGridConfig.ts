/**
 * The SendGrid credential and host, as a service with two constructors: a
 * literal (`layer`) and one read from `effect/Config` (`layerConfig`).
 *
 * @module SendGridConfig
 */

import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";

/** SendGrid's global API host. The EU regional host is `https://api.eu.sendgrid.com`. */
export const DEFAULT_BASE_URL = "https://api.sendgrid.com";

/** What {@link SendGridConfig.layer} takes. */
export interface SendGridConfigInput {
  /** The API key. Wrap with `Redacted.make(...)` or read it via `Config.redacted(...)`. */
  readonly apiKey: Redacted.Redacted<string>;
  /**
   * The API host, without a trailing slash. Defaults to
   * {@link DEFAULT_BASE_URL}; set it for the EU regional host or a stub server.
   */
  // oxlint-disable-next-line effect/prefer-option-over-null -- a consumer-facing config input: an omitted key IS the default, and asking every caller to spell `Option.none()` for it buys nothing
  readonly baseUrl?: string;
}

/** The SendGrid configuration as a service. */
export class SendGridConfig extends Context.Service<
  SendGridConfig,
  {
    readonly apiKey: Redacted.Redacted<string>;
    readonly baseUrl: string;
  }
>()("@thomasfosterau/effect-email-sendgrid/SendGridConfig") {
  /** A configuration from literal values. */
  static readonly layer = (config: SendGridConfigInput): Layer.Layer<SendGridConfig> =>
    Layer.succeed(SendGridConfig, {
      apiKey: config.apiKey,
      baseUrl: config.baseUrl ?? DEFAULT_BASE_URL,
    });

  /**
   * A configuration read through `effect/Config`: `SENDGRID_API_KEY`
   * (redacted) and `SENDGRID_BASE_URL` (optional). An unset or empty
   * `SENDGRID_API_KEY` reads as an empty key, so the layer still builds and
   * every client call fails with `InvalidApiKeyError` (a send: `EmailSendError`
   * with that `cause`), as with `layer({ apiKey })`.
   * Both boot because Effect's `ConfigProvider` reads an empty variable as
   * missing (unless built with `preserveEmptyStrings`), so the layer cannot
   * tell the two apart. An empty `SENDGRID_BASE_URL` falls back to
   * {@link DEFAULT_BASE_URL}. Any other `ConfigError` (a provider source
   * error) still fails construction.
   */
  static readonly layerConfig = Layer.effect(
    SendGridConfig,
    Effect.gen(function* () {
      // `withDefault` replaces only absent data, which is what an empty
      // variable reads as; a source error still fails the layer.
      const apiKey = yield* Config.Redacted("SENDGRID_API_KEY").pipe(
        Config.withDefault(Redacted.make("")),
      );
      const baseUrl = yield* Config.String("SENDGRID_BASE_URL").pipe(
        Config.withDefault(DEFAULT_BASE_URL),
      );
      return { apiKey, baseUrl };
    }),
  );
}
