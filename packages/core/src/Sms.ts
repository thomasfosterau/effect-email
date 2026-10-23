/**
 * The SMS message model every SMS provider sends: phone numbers, senders,
 * the message itself and the result of a send.
 *
 * Provider-agnostic on purpose, as the email model is: a provider maps this
 * shape onto its wire format (Twilio's form-encoded `Messages` resource) and
 * provider-only concepts (a Twilio Messaging Service SID) stay in that
 * provider's configuration — see the package `CLAUDE.md`.
 *
 * @module Sms
 * @since 0.1.0
 */

import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { SmsValidationError } from "./Errors.ts";
import { issueLines } from "./internal/issues.ts";

/**
 * A phone number in E.164 form: `+`, a country code and the subscriber
 * number, 15 digits at most, no spaces or punctuation. A syntactic check
 * only; whether the number can receive SMS is the provider's verdict.
 *
 * @since 0.1.0
 */
export const PhoneNumber = Schema.String.pipe(
  Schema.check(
    Schema.isPattern(/^\+[1-9]\d{1,14}$/, {
      title: "PhoneNumber",
      description: "an E.164 phone number such as +61412345678",
    }),
  ),
);
/**
 * The decoded type of the {@link PhoneNumber} schema.
 *
 * @since 0.1.0
 */
export type PhoneNumber = typeof PhoneNumber.Type;

/**
 * Who an SMS is from: an E.164 number, a short code (digits only) or an
 * alphanumeric sender ID (at most 11 letters, digits and spaces). Which of
 * these a destination country accepts is the provider's and carrier's
 * verdict, not the schema's.
 *
 * @since 0.1.0
 */
export const SmsSender = Schema.String.pipe(
  Schema.check(
    Schema.isPattern(/^(?:\+[1-9]\d{1,14}|[A-Za-z0-9 ]{1,11})$/, {
      title: "SmsSender",
      description: "an E.164 phone number, a short code or an alphanumeric sender ID",
    }),
  ),
);
/**
 * The decoded type of the {@link SmsSender} schema.
 *
 * @since 0.1.0
 */
export type SmsSender = typeof SmsSender.Type;

/**
 * One SMS to send: one recipient, a non-empty body.
 *
 * `from` is optional: a provider configured with a default sender (Twilio's
 * `from` or Messaging Service) fills it in, and a message's own `from` wins
 * over that default.
 *
 * @since 0.1.0
 */
export const SmsMessage = Schema.Struct({
  to: PhoneNumber,
  from: Schema.optionalKey(SmsSender),
  body: Schema.NonEmptyString,
});
/**
 * The decoded type of the {@link SmsMessage} schema.
 *
 * @since 0.1.0
 */
export type SmsMessage = typeof SmsMessage.Type;

/**
 * What a provider answers for one accepted SMS: the provider's message id
 * when it gives one (Twilio's `SM…` SID). Encodes as an optional `id` key,
 * so a result serialises as plain JSON.
 *
 * @since 0.1.0
 */
export const SmsSendResult = Schema.Struct({
  id: Schema.OptionFromOptionalKey(Schema.String),
});
/**
 * The decoded type of the {@link SmsSendResult} schema.
 *
 * @since 0.1.0
 */
export type SmsSendResult = typeof SmsSendResult.Type;

/**
 * Decode an untrusted value into an {@link SmsMessage}, failing with an
 * {@link SmsValidationError} that lists each issue as one line.
 *
 * @example
 * ```ts
 * import * as assert from "node:assert";
 * import * as Effect from "effect/Effect";
 * import * as Exit from "effect/Exit";
 * import { decodeSmsMessage } from "@thomasfosterau/effect-connect";
 *
 * const valid = Effect.runSyncExit(
 *   decodeSmsMessage({ to: "+61412345678", from: "Example", body: "Your code is 123456" }),
 * );
 * assert.ok(Exit.isSuccess(valid));
 *
 * const invalid = Effect.runSyncExit(decodeSmsMessage({ to: "0412 345 678", body: "" }));
 * assert.ok(Exit.isFailure(invalid));
 * ```
 *
 * @since 0.1.0
 */
export const decodeSmsMessage = (
  // oxlint-disable-next-line effect/no-unknown-parameters -- this IS the I/O boundary: the whole point of the function is to run the schema over unparsed input
  input: unknown,
): Effect.Effect<SmsMessage, SmsValidationError> =>
  Schema.decodeUnknownEffect(SmsMessage, { errors: "all" })(input).pipe(
    Effect.mapError(
      (error) =>
        new SmsValidationError({
          message: "The SMS message is invalid",
          issues: issueLines(error),
        }),
    ),
  );
