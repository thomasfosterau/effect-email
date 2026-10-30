/**
 * The Vonage credential, default sender and host, as a service with two
 * constructors: a literal (`layer`) and one read from `effect/Config`
 * (`layerConfig`).
 *
 * @module VonageConfig
 * @since 0.1.0
 */

import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import type * as Redacted from "effect/Redacted";

/**
 * Vonage's API host, as a compile-time constant. A hard-coded literal rather
 * than anything derived from input (SEC-SSRF-001 in the consuming
 * applications); `baseUrl` exists for a stub server in a test, never for
 * request input.
 *
 * @since 0.1.0
 */
export const DEFAULT_BASE_URL = "https://api.nexmo.com";

/**
 * What {@link VonageConfig.layer} takes.
 *
 * @since 0.1.0
 */
export interface VonageConfigInput {
  /** The API key: the username half of HTTP Basic auth. */
  readonly apiKey: string;
  /**
   * The API secret: the password half of HTTP Basic auth. Wrap with
   * `Redacted.make(...)` or read it via `Config.redacted(...)`.
   */
  readonly apiSecret: Redacted.Redacted;
  /** The default sender for a message without its own `from`. */
  // oxlint-disable-next-line effect/prefer-option-over-null -- consumer-facing config input: an omitted key IS the default, and asking every caller to spell `Option.none()` buys nothing
  readonly from?: string | undefined;
  /** The API host, without a trailing slash. Defaults to {@link DEFAULT_BASE_URL}. */
  // oxlint-disable-next-line effect/prefer-option-over-null -- as above
  readonly baseUrl?: string | undefined;
}

/**
 * The Vonage configuration as a service.
 *
 * @since 0.1.0
 */
export class VonageConfig extends Context.Service<
  VonageConfig,
  {
    readonly apiKey: string;
    readonly apiSecret: Redacted.Redacted;
    readonly from: Option.Option<string>;
    readonly baseUrl: string;
  }
>()("@thomasfosterau/effect-connect-vonage/VonageConfig") {
  /**
   * A configuration from literal values.
   *
   * @since 0.1.0
   */
  static readonly layer = (config: VonageConfigInput): Layer.Layer<VonageConfig> =>
    Layer.succeed(VonageConfig, {
      apiKey: config.apiKey,
      apiSecret: config.apiSecret,
      from: Option.fromNullishOr(config.from),
      baseUrl: config.baseUrl ?? DEFAULT_BASE_URL,
    });

  /**
   * A configuration read through `effect/Config`: `VONAGE_API_KEY` and
   * `VONAGE_API_SECRET` (required, the secret redacted), and the optional
   * `VONAGE_FROM` and `VONAGE_BASE_URL`. Fails with a `ConfigError` when a
   * required variable is unset or empty (an empty variable reads as
   * missing); an empty optional one reads as unset.
   *
   * @since 0.1.0
   */
  static readonly layerConfig = Layer.effect(
    VonageConfig,
    Effect.gen(function* () {
      // oxlint-disable-next-line effect/prefer-redacted-config -- the API key is the public username half of the credential; its secret is `VONAGE_API_SECRET`, which is redacted
      const apiKey = yield* Config.String("VONAGE_API_KEY");
      const apiSecret = yield* Config.Redacted("VONAGE_API_SECRET");
      const from = yield* Config.option(Config.String("VONAGE_FROM"));
      const baseUrl = yield* Config.String("VONAGE_BASE_URL").pipe(
        Config.withDefault(DEFAULT_BASE_URL),
      );
      return { apiKey, apiSecret, from, baseUrl };
    }),
  );
}
