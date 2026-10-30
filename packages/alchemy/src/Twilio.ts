/**
 * The Worker bindings `@thomasfosterau/effect-connect-twilio` reads
 * (`TwilioEnv`): the account SID, the auth token as a secret, and the
 * optional API key SID, default senders and Messaging Service.
 *
 * @module Twilio
 * @since 0.1.0
 */

import * as Config from "effect/Config";
import * as Option from "effect/Option";
import type * as Redacted from "effect/Redacted";
import { presentOnly } from "./internal/presentOnly.ts";

/**
 * What {@link twilioBindings} takes. An optional value that is omitted,
 * `undefined` or blank is left out of the bindings.
 *
 * @since 0.1.0
 */
export interface TwilioBindingsInput {
  /** The account SID (`AC…`). */
  readonly accountSid: string;
  /** The auth token, or the API key secret when `apiKeySid` is set. */
  readonly authToken: Redacted.Redacted;
  /** An API key SID (`SK…`) to authenticate as instead of the account. */
  // oxlint-disable-next-line effect/prefer-option-over-null -- a consumer-facing input: an omitted key IS "not bound", and asking every caller to spell `Option.none()` buys nothing
  readonly apiKeySid?: string | undefined;
  /** The default SMS sender. */
  // oxlint-disable-next-line effect/prefer-option-over-null -- as above
  readonly from?: string | undefined;
  /** The default WhatsApp sender. */
  // oxlint-disable-next-line effect/prefer-option-over-null -- as above
  readonly whatsappFrom?: string | undefined;
  /** A Messaging Service SID (`MG…`) to send through. */
  // oxlint-disable-next-line effect/prefer-option-over-null -- as above
  readonly messagingServiceSid?: string | undefined;
}

/**
 * The Twilio bindings for a Worker's `env`. `TWILIO_AUTH_TOKEN` is deployed
 * as a secret; the SIDs and senders are plain. Each optional key is present
 * only when it has a value.
 *
 * @since 0.1.0
 */
export interface TwilioBindings {
  readonly TWILIO_ACCOUNT_SID: string;
  readonly TWILIO_AUTH_TOKEN: Redacted.Redacted;
  readonly TWILIO_API_KEY_SID?: string;
  readonly TWILIO_FROM?: string;
  readonly TWILIO_WHATSAPP_FROM?: string;
  readonly TWILIO_MESSAGING_SERVICE_SID?: string;
}

const withOptional = (
  required: Pick<TwilioBindings, "TWILIO_ACCOUNT_SID" | "TWILIO_AUTH_TOKEN">,
  optional: {
    readonly TWILIO_API_KEY_SID: Option.Option<string>;
    readonly TWILIO_FROM: Option.Option<string>;
    readonly TWILIO_WHATSAPP_FROM: Option.Option<string>;
    readonly TWILIO_MESSAGING_SERVICE_SID: Option.Option<string>;
  },
): TwilioBindings => ({ ...presentOnly(optional), ...required });

/**
 * The Twilio bindings from literal values, to spread into a Worker's `env`.
 * Optional values that are omitted, `undefined` or blank are left out.
 *
 * @example
 * ```ts
 * import * as assert from "node:assert";
 * import * as Redacted from "effect/Redacted";
 * import { twilioBindings } from "@thomasfosterau/effect-connect-alchemy";
 *
 * const env = twilioBindings({
 *   accountSid: "AC123",
 *   authToken: Redacted.make("token"),
 *   from: "+61400000000",
 *   messagingServiceSid: undefined,
 * });
 * assert.deepStrictEqual(Object.keys(env).sort(), ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM"]);
 * ```
 *
 * @since 0.1.0
 */
export const twilioBindings = (input: TwilioBindingsInput): TwilioBindings =>
  withOptional(
    { TWILIO_ACCOUNT_SID: input.accountSid, TWILIO_AUTH_TOKEN: input.authToken },
    {
      TWILIO_API_KEY_SID: Option.fromNullishOr(input.apiKeySid),
      TWILIO_FROM: Option.fromNullishOr(input.from),
      TWILIO_WHATSAPP_FROM: Option.fromNullishOr(input.whatsappFrom),
      TWILIO_MESSAGING_SERVICE_SID: Option.fromNullishOr(input.messagingServiceSid),
    },
  );

/**
 * The Twilio bindings read through `effect/Config` on the deploy machine,
 * under the same names: `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN`
 * (required, the token redacted), the rest optional and left out when unset
 * or empty. Fails with a `ConfigError` when a required one is missing.
 *
 * @example
 * ```ts
 * import * as assert from "node:assert";
 * import * as ConfigProvider from "effect/ConfigProvider";
 * import * as Effect from "effect/Effect";
 * import { twilioBindingsConfig } from "@thomasfosterau/effect-connect-alchemy";
 *
 * const env = Effect.runSync(
 *   twilioBindingsConfig.parse(
 *     ConfigProvider.fromEnv({
 *       env: { TWILIO_ACCOUNT_SID: "AC123", TWILIO_AUTH_TOKEN: "token", TWILIO_FROM: "" },
 *     }),
 *   ),
 * );
 * assert.deepStrictEqual(Object.keys(env).sort(), ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"]);
 * ```
 *
 * @since 0.1.0
 */
export const twilioBindingsConfig: Config.Config<TwilioBindings> = Config.map(
  Config.all({
    required: Config.all({
      TWILIO_ACCOUNT_SID: Config.String("TWILIO_ACCOUNT_SID"),
      TWILIO_AUTH_TOKEN: Config.Redacted("TWILIO_AUTH_TOKEN"),
    }),
    optional: Config.all({
      // oxlint-disable-next-line effect/prefer-redacted-config -- an API key SID (`SK…`) is the public username half of the credential; its secret is `TWILIO_AUTH_TOKEN`, which is redacted
      TWILIO_API_KEY_SID: Config.option(Config.String("TWILIO_API_KEY_SID")),
      TWILIO_FROM: Config.option(Config.String("TWILIO_FROM")),
      TWILIO_WHATSAPP_FROM: Config.option(Config.String("TWILIO_WHATSAPP_FROM")),
      TWILIO_MESSAGING_SERVICE_SID: Config.option(Config.String("TWILIO_MESSAGING_SERVICE_SID")),
    }),
  }),
  ({ required, optional }) => withOptional(required, optional),
);
