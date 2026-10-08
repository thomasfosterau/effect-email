/**
 * The Resend credential and host, as a service with two constructors: a
 * literal (`layer`) and one read from `effect/Config` (`layerConfig`).
 *
 * @module ResendConfig
 * @since 0.1.0
 */

import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type * as Redacted from "effect/Redacted";

/**
 * Resend's API host, as a compile-time constant. A hard-coded literal rather
 * than anything derived from input: a `fetch` whose host could be steered is
 * exactly the outbound-request hazard the consuming applications' security
 * policies forbid (SEC-SSRF-001), and the only values that ever vary in a
 * send are the message fields in the body. `baseUrl` exists for a stub
 * server in a test, never for request input.
 *
 * @since 0.1.0
 */
export const DEFAULT_BASE_URL = "https://api.resend.com";

/**
 * What {@link ResendConfig.layer} takes.
 *
 * @since 0.1.0
 */
export interface ResendConfigInput {
  /** The API key. Wrap with `Redacted.make(...)` or read it via `Config.redacted(...)`. */
  readonly apiKey: Redacted.Redacted<string>;
  /** The API host, without a trailing slash. Defaults to {@link DEFAULT_BASE_URL}. */
  // oxlint-disable-next-line effect/prefer-option-over-null -- a consumer-facing config input: an omitted key IS the default, and asking every caller to spell `Option.none()` for it buys nothing
  readonly baseUrl?: string;
}

/**
 * The Resend configuration as a service.
 *
 * @since 0.1.0
 */
export class ResendConfig extends Context.Service<
  ResendConfig,
  {
    readonly apiKey: Redacted.Redacted<string>;
    readonly baseUrl: string;
  }
>()("@thomasfosterau/effect-email-resend/ResendConfig") {
  /**
   * A configuration from literal values.
   *
   * @since 0.1.0
   */
  static readonly layer = (config: ResendConfigInput): Layer.Layer<ResendConfig> =>
    Layer.succeed(ResendConfig, {
      apiKey: config.apiKey,
      baseUrl: config.baseUrl ?? DEFAULT_BASE_URL,
    });

  /**
   * A configuration read through `effect/Config`: `RESEND_API_KEY`
   * (required, redacted) and `RESEND_BASE_URL` (optional). Fails with a
   * `ConfigError` when `RESEND_API_KEY` is unset or empty; an empty
   * `RESEND_BASE_URL` falls back to {@link DEFAULT_BASE_URL}.
   *
   * @since 0.1.0
   */
  static readonly layerConfig = Layer.effect(
    ResendConfig,
    Effect.gen(function* () {
      const apiKey = yield* Config.Redacted("RESEND_API_KEY");
      const baseUrl = yield* Config.String("RESEND_BASE_URL").pipe(
        Config.withDefault(DEFAULT_BASE_URL),
      );
      return { apiKey, baseUrl };
    }),
  );
}
