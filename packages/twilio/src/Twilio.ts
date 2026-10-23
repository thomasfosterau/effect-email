/**
 * The Twilio sender: the core `SmsMessage` mapped onto Twilio Programmable
 * Messaging's `POST /2010-04-01/Accounts/{AccountSid}/Messages.json`
 * (form-encoded), sent over Effect's `HttpClient` with no SDK.
 *
 * The transport properties the Resend provider pins, kept here:
 *
 * - a fixed literal host (`DEFAULT_BASE_URL`), and an account SID
 *   checked against `AC` + 32 hex digits before it is put in the URL path,
 *   so no configured value can steer the request to another path;
 * - `redirect: "error"` on the underlying `fetch`: Workers' default
 *   (`follow`) replays the request at the redirect target with the
 *   `Authorization` header intact, which would hand the Basic credential to
 *   whatever host a hijacked response named (SEC-SECRET-001);
 * - a non-2xx becomes an `SmsSendError` carrying the status and a
 *   **truncated** body, never the raw unbounded one, and never the token;
 * - no retry: the caller decides the policy.
 *
 * @module Twilio
 * @since 0.1.0
 */

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import {
  SmsSendError,
  SmsService,
  describeHttpError,
  httpErrorStatus,
  isSuccessStatus,
  refuseRedirects,
  rejectionMessage,
  type SmsMessage,
  type SmsSendResult,
} from "@thomasfosterau/effect-connect";
import { TwilioConfig } from "./TwilioConfig.ts";

/**
 * The form fields Twilio's Messages resource accepts, as far as the core
 * message carries them. At least one of `From` / `MessagingServiceSid` is
 * present on every request this provider sends; optional members are
 * `Schema.optional` because the mapping assigns `undefined` for an absent
 * one, which the form encoding drops.
 *
 * @since 0.1.0
 */
export const TwilioMessageParams = Schema.Struct({
  To: Schema.String,
  Body: Schema.String,
  From: Schema.optional(Schema.String),
  MessagingServiceSid: Schema.optional(Schema.String),
});
/**
 * The decoded type of the {@link TwilioMessageParams} schema.
 *
 * @since 0.1.0
 */
export type TwilioMessageParams = typeof TwilioMessageParams.Type;

/**
 * The defaults {@link toTwilioParams} falls back on: the configured sender
 * and Messaging Service, each `none` when unset.
 *
 * @since 0.1.0
 */
export interface TwilioSenderDefaults {
  readonly from: Option.Option<string>;
  readonly messagingServiceSid: Option.Option<string>;
}

/**
 * Map a core SMS onto Twilio's form fields: the message's own `from` wins
 * over the configured default, and a configured Messaging Service rides
 * along either way (Twilio sends from `From` when both are present). `none`
 * when there is no sender at all, which Twilio would reject.
 *
 * @example
 * ```ts
 * import * as assert from "node:assert";
 * import * as Option from "effect/Option";
 * import { toTwilioParams } from "@thomasfosterau/effect-connect-twilio";
 *
 * const params = toTwilioParams(
 *   { to: "+61412345678", body: "Your code is 123456" },
 *   { from: Option.some("Example"), messagingServiceSid: Option.none() },
 * );
 *
 * assert.deepStrictEqual(
 *   Option.getOrThrow(params),
 *   { To: "+61412345678", Body: "Your code is 123456", From: "Example", MessagingServiceSid: undefined },
 * );
 * ```
 *
 * @since 0.1.0
 */
export const toTwilioParams = (
  message: SmsMessage,
  defaults: TwilioSenderDefaults,
): Option.Option<TwilioMessageParams> => {
  const from = Option.orElse(Option.fromNullishOr(message.from), () => defaults.from);
  return Option.isNone(from) && Option.isNone(defaults.messagingServiceSid)
    ? Option.none()
    : Option.some({
        To: message.to,
        Body: message.body,
        From: Option.getOrUndefined(from),
        MessagingServiceSid: Option.getOrUndefined(defaults.messagingServiceSid),
      });
};

const PROVIDER = "twilio";

/** Twilio account SIDs: `AC` and 32 hex digits. Nothing else may reach the URL path. */
const ACCOUNT_SID = /^AC[0-9a-fA-F]{32}$/;

const MessageResponse = Schema.Struct({ sid: Schema.String });

/**
 * How many messages {@link layerSmsService}'s `sendBatch` keeps in flight.
 * Twilio has no batch endpoint, and an account's API concurrency is
 * limited, so a batch is sent a few at a time rather than all at once.
 */
const BATCH_CONCURRENCY = 4;

/** An `SmsSendError` for a send refused before any request was made. */
const refused = (message: string): SmsSendError =>
  new SmsSendError({ provider: PROVIDER, message, status: Option.none() });

/**
 * The core `SmsService` over Twilio's REST API and the `HttpClient` in
 * context. Twilio has no batch endpoint, so `sendBatch` sends each message
 * on its own, a few at a time, and fails on the first failure.
 *
 * @since 0.1.0
 */
export const layerSmsService: Layer.Layer<SmsService, never, TwilioConfig | HttpClient.HttpClient> =
  Layer.effect(
    SmsService,
    Effect.gen(function* () {
      const config = yield* TwilioConfig;
      const http = yield* HttpClient.HttpClient;

      const send = Effect.fn("Twilio.send")(function* (message: SmsMessage) {
        if (!ACCOUNT_SID.test(config.accountSid)) {
          return yield* refused(
            "Twilio account SID is not of the form AC followed by 32 hex digits",
          );
        }
        const params = yield* Option.match(toTwilioParams(message, config), {
          onNone: () =>
            Effect.fail(
              refused(
                "Twilio send has no sender: set `from` on the message, or `from` / `messagingServiceSid` in the configuration",
              ),
            ),
          onSome: Effect.succeed,
        });
        const request = HttpClientRequest.post(
          `${config.baseUrl}/2010-04-01/Accounts/${config.accountSid}/Messages.json`,
          { acceptJson: true },
        ).pipe(
          HttpClientRequest.basicAuth(config.username, config.authToken),
          HttpClientRequest.bodyUrlParams(params),
        );
        const response = yield* http.execute(request).pipe(
          refuseRedirects,
          Effect.mapError(
            (error) =>
              new SmsSendError({
                provider: PROVIDER,
                message: `Twilio was unreachable: ${describeHttpError(error)}`,
                status: httpErrorStatus(error),
                cause: error,
              }),
          ),
        );
        if (!isSuccessStatus(response.status)) {
          const message = yield* rejectionMessage(response, "Twilio rejected the send");
          return yield* new SmsSendError({
            provider: PROVIDER,
            message,
            status: Option.some(response.status),
          });
        }
        const { sid } = yield* HttpClientResponse.schemaBodyJson(MessageResponse)(response).pipe(
          Effect.mapError(
            (cause) =>
              new SmsSendError({
                provider: PROVIDER,
                message: `Twilio answered ${response.status} with an unexpected body`,
                status: Option.some(response.status),
                cause,
              }),
          ),
        );
        const result: SmsSendResult = { id: Option.some(sid) };
        return result;
      });

      return {
        send,
        sendBatch: (messages) => Effect.forEach(messages, send, { concurrency: BATCH_CONCURRENCY }),
      };
    }),
  );

const dropOne = (_message: SmsMessage): Effect.Effect<SmsSendResult> =>
  Effect.as(
    // Logs neither the recipient (PII) nor the body (an SMS is very often a
    // one-time code): the line exists only to answer "is SMS being dropped
    // for want of a credential?".
    Effect.logWarning("[effect-connect-twilio] no Twilio credentials configured; dropping an SMS"),
    { id: Option.none() },
  );

/**
 * The sender used when no credential is configured: every send **succeeds**
 * without sending, and logs one line that names neither the recipient nor
 * the body.
 *
 * The same trade as the Resend provider's `noop`: it keeps an un-provisioned
 * preview stage working, and is only safe while the SMS is advisory. If a
 * send gates an account (a sign-in code with no other way in), fail loudly at
 * boot instead of installing this.
 *
 * @since 0.1.0
 */
export const noop: Layer.Layer<SmsService> = Layer.succeed(SmsService, {
  send: dropOne,
  sendBatch: (messages) => Effect.forEach(messages, dropOne, { concurrency: 1 }),
});
