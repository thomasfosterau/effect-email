/**
 * The Vonage sender: the core `SmsMessage` mapped onto the Vonage Messages
 * API's `POST /v1/messages` (JSON, `channel: "sms"`), sent over Effect's
 * `HttpClient` with no SDK.
 *
 * The transport properties the other providers pin, kept here:
 *
 * - a fixed literal host (`DEFAULT_BASE_URL`) and a fixed path, so no
 *   configured value can steer the request elsewhere;
 * - the API key and secret travel as HTTP Basic auth in the `Authorization`
 *   header, never in the JSON body;
 * - `redirect: "error"` on the underlying `fetch` (the core's
 *   `refuseRedirects`): Workers' default (`follow`) replays the request at
 *   the redirect target with the `Authorization` header intact, which would
 *   hand the Basic credential to whatever host a hijacked response named
 *   (SEC-SECRET-001);
 * - a non-2xx becomes an `SmsSendError` carrying the status and a
 *   **truncated** body, never the raw unbounded one, and never the secret;
 * - no retry: the caller decides the policy.
 *
 * @module Vonage
 * @since 0.1.0
 */

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Str from "effect/String";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import {
  describeHttpError,
  droppingSender,
  httpErrorStatus,
  isSuccessStatus,
  refuseRedirects,
  rejectionMessage,
  SmsSendError,
  SmsService,
  type SmsMessage,
  type SmsSendResult,
} from "@thomasfosterau/effect-connect";
import { VonageConfig } from "./VonageConfig.ts";

/**
 * The JSON body the Vonage Messages API takes for one SMS text message, as
 * far as the core message carries it. `to` and `from` are in Vonage's
 * number form: E.164 without the leading `+` (an alphanumeric sender ID
 * passes through unchanged).
 *
 * @since 0.1.0
 */
export const VonageMessagePayload = Schema.Struct({
  message_type: Schema.Literal("text"),
  channel: Schema.Literal("sms"),
  to: Schema.String,
  from: Schema.String,
  text: Schema.String,
});
/**
 * The decoded type of the {@link VonageMessagePayload} schema.
 *
 * @since 0.1.0
 */
export type VonageMessagePayload = typeof VonageMessagePayload.Type;

/**
 * A number in Vonage's form: E.164 without the leading `+`. A value that does
 * not start with `+` (a short code, an alphanumeric sender ID) is returned
 * unchanged.
 *
 * @example
 * ```ts
 * import * as assert from "node:assert";
 * import { toVonageNumber } from "@thomasfosterau/effect-connect-vonage";
 *
 * assert.strictEqual(toVonageNumber("+61412345678"), "61412345678");
 * assert.strictEqual(toVonageNumber("Example"), "Example");
 * ```
 *
 * @since 0.1.0
 */
export const toVonageNumber = (value: string): string =>
  Str.startsWith("+")(value) ? value.slice(1) : value;

/**
 * Map a core SMS onto the Vonage Messages API body: the message's own `from`
 * wins over the configured default, and both numbers lose their leading `+`.
 * `none` when there is no sender at all, which Vonage would reject.
 *
 * @example
 * ```ts
 * import * as assert from "node:assert";
 * import * as Option from "effect/Option";
 * import { toVonagePayload } from "@thomasfosterau/effect-connect-vonage";
 *
 * const payload = toVonagePayload(
 *   { to: "+61412345678", body: "Your code is 123456" },
 *   Option.some("Example"),
 * );
 *
 * assert.deepStrictEqual(Option.getOrThrow(payload), {
 *   message_type: "text",
 *   channel: "sms",
 *   to: "61412345678",
 *   from: "Example",
 *   text: "Your code is 123456",
 * });
 * ```
 *
 * @since 0.1.0
 */
export const toVonagePayload = (
  message: SmsMessage,
  defaultFrom: Option.Option<string>,
): Option.Option<VonageMessagePayload> =>
  Option.map(
    Option.orElse(Option.fromNullishOr(message.from), () => defaultFrom),
    (from) => ({
      message_type: "text",
      channel: "sms",
      to: toVonageNumber(message.to),
      from: toVonageNumber(from),
      text: message.body,
    }),
  );

const PROVIDER = "vonage";

const MessageResponse = Schema.Struct({ message_uuid: Schema.String });

/**
 * How many messages {@link layerSmsService}'s `sendBatch` keeps in flight.
 * The Messages API has no batch endpoint and rate-limits an account, so a
 * batch is sent a few at a time rather than all at once.
 */
const BATCH_CONCURRENCY = 4;

const NO_SENDER =
  "Vonage send has no sender: set `from` on the message, or `from` in the configuration";

/** An `SmsSendError` from this provider; `cause` only when there is one. */
const failure = (message: string, status: Option.Option<number>, cause?: unknown): SmsSendError =>
  cause === undefined
    ? new SmsSendError({ provider: PROVIDER, message, status })
    : new SmsSendError({ provider: PROVIDER, message, status, cause });

/**
 * The core `SmsService` over the Vonage Messages API and the `HttpClient` in
 * context. Vonage has no batch endpoint, so `sendBatch` sends each message on
 * its own, a few at a time, and fails on the first failure.
 *
 * @since 0.1.0
 */
export const layerSmsService: Layer.Layer<SmsService, never, VonageConfig | HttpClient.HttpClient> =
  Layer.effect(
    SmsService,
    Effect.gen(function* () {
      const config = yield* VonageConfig;
      const http = yield* HttpClient.HttpClient;

      const send = Effect.fn("Vonage.send")(function* (message: SmsMessage) {
        const payload = yield* Option.match(toVonagePayload(message, config.from), {
          onNone: () => Effect.fail(failure(NO_SENDER, Option.none())),
          onSome: Effect.succeed,
        });
        const request = HttpClientRequest.post(`${config.baseUrl}/v1/messages`, {
          acceptJson: true,
        }).pipe(
          HttpClientRequest.basicAuth(config.apiKey, config.apiSecret),
          // Five string fields: `JSON.stringify` cannot throw on them, so the
          // encoding needs no failure channel.
          HttpClientRequest.bodyJsonUnsafe(payload),
        );
        const response = yield* refuseRedirects(http.execute(request)).pipe(
          Effect.mapError((error) =>
            failure(
              `Vonage was unreachable: ${describeHttpError(error)}`,
              httpErrorStatus(error),
              error,
            ),
          ),
        );
        const status = Option.some(response.status);
        if (!isSuccessStatus(response.status)) {
          return yield* Effect.flatMap(
            rejectionMessage(response, "Vonage rejected the send"),
            (rejection) => Effect.fail(failure(rejection, status)),
          );
        }
        const accepted = yield* HttpClientResponse.schemaBodyJson(MessageResponse)(response).pipe(
          Effect.mapError((cause) =>
            failure(`Vonage answered ${response.status} with an unexpected body`, status, cause),
          ),
        );
        const result: SmsSendResult = { id: Option.some(accepted.message_uuid) };
        return result;
      });

      return {
        send,
        sendBatch: (messages) => Effect.forEach(messages, send, { concurrency: BATCH_CONCURRENCY }),
      };
    }),
  );

/**
 * The sender used when no credential is configured: every send **succeeds**
 * without sending, and logs one line that names neither the recipient nor
 * the body.
 *
 * The same trade as the Resend and Twilio providers' `noop`: it keeps an
 * un-provisioned preview stage working, and is only safe while the SMS is
 * advisory. If a send gates an account (a sign-in code with no other way
 * in), fail loudly at boot instead of installing this.
 *
 * @since 0.1.0
 */
export const noop: Layer.Layer<SmsService> = Layer.succeed(
  SmsService,
  // Logs neither the recipient (PII) nor the body (an SMS is very often a
  // one-time code): the line exists only to answer "is SMS being dropped
  // for want of a credential?".
  droppingSender<SmsMessage>(
    () => "[effect-connect-vonage] no Vonage credentials configured; dropping an SMS",
  ),
);
