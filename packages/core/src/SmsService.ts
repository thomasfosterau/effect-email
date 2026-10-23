/**
 * The service every SMS provider implements and every consumer sends SMS
 * through — the SMS counterpart of `EmailService`, with the same shape.
 *
 * A separate service per channel, not one service over every channel: an
 * application that sends only email never has to provide an SMS layer, and
 * a missing SMS provider is a type error at the edge rather than a runtime
 * failure at the first send.
 *
 * @module SmsService
 * @since 0.1.0
 */

import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { recordingSender } from "./internal/recording.ts";
import type { SmsMessage, SmsSendResult } from "./Sms.ts";
import type { SmsSendError } from "./Errors.ts";

/**
 * The SMS sender as an Effect service: the operations a provider implements.
 *
 * - `send` — send one message. Fails `SmsSendError`; never throws.
 * - `sendBatch` — send several messages, one result per message, in order.
 *   A provider with a real batch endpoint uses it; one without sends
 *   concurrently. The whole batch fails on the first failure — a caller that
 *   wants per-message outcomes calls `send` once per message.
 *
 * @since 0.1.0
 */
export class SmsService extends Context.Service<
  SmsService,
  {
    readonly send: (message: SmsMessage) => Effect.Effect<SmsSendResult, SmsSendError>;
    readonly sendBatch: (
      messages: ReadonlyArray<SmsMessage>,
    ) => Effect.Effect<ReadonlyArray<SmsSendResult>, SmsSendError>;
  }
>()("@thomasfosterau/effect-connect/SmsService") {
  /**
   * A recording double: every send succeeds and is appended to `sent`, so a
   * test can assert what would have gone out without a network seam at all.
   * Results carry `recorded-<n>` ids, numbered from 1 in send order.
   *
   * @since 0.1.0
   */
  static readonly layerRecording = (sent: Array<SmsMessage>): Layer.Layer<SmsService> =>
    Layer.sync(SmsService, () => recordingSender(sent));
}

/**
 * Send one SMS through the {@link SmsService} in context.
 *
 * @example
 * ```ts
 * import * as assert from "node:assert";
 * import * as Effect from "effect/Effect";
 * import * as Option from "effect/Option";
 * import { SmsService, sendSms, type SmsMessage } from "@thomasfosterau/effect-connect";
 *
 * const sent: Array<SmsMessage> = [];
 *
 * const result = Effect.runSync(
 *   sendSms({ to: "+61412345678", body: "Your code is 123456" }).pipe(
 *     Effect.provide(SmsService.layerRecording(sent)),
 *   ),
 * );
 *
 * assert.strictEqual(sent.length, 1);
 * assert.ok(Option.isSome(result.id));
 * ```
 *
 * @since 0.1.0
 */
export const sendSms = (
  message: SmsMessage,
): Effect.Effect<SmsSendResult, SmsSendError, SmsService> =>
  Effect.flatMap(SmsService, (service) => service.send(message));

/**
 * Send several SMS through the {@link SmsService} in context.
 *
 * @since 0.1.0
 */
export const sendSmsBatch = (
  messages: ReadonlyArray<SmsMessage>,
): Effect.Effect<ReadonlyArray<SmsSendResult>, SmsSendError, SmsService> =>
  Effect.flatMap(SmsService, (service) => service.sendBatch(messages));
