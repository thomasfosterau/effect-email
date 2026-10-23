/**
 * The service every WhatsApp provider implements and every consumer sends
 * WhatsApp messages through — the WhatsApp counterpart of `SmsService`, with
 * the same shape.
 *
 * A separate service per channel: an application that sends SMS but not
 * WhatsApp never has to provide a WhatsApp layer, and a missing WhatsApp
 * provider is a type error at the edge rather than a runtime failure.
 *
 * @module WhatsAppService
 * @since 0.1.0
 */

import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { recordingSender } from "./internal/recording.ts";
import type { WhatsAppMessage, WhatsAppSendResult } from "./WhatsApp.ts";
import type { WhatsAppSendError } from "./Errors.ts";

/**
 * The WhatsApp sender as an Effect service: the operations a provider
 * implements.
 *
 * - `send` — send one message (text or template). Fails
 *   `WhatsAppSendError`; never throws.
 * - `sendBatch` — send several messages, one result per message, in order.
 *   The whole batch fails on the first failure — a caller that wants
 *   per-message outcomes calls `send` once per message.
 *
 * @since 0.1.0
 */
export class WhatsAppService extends Context.Service<
  WhatsAppService,
  {
    readonly send: (
      message: WhatsAppMessage,
    ) => Effect.Effect<WhatsAppSendResult, WhatsAppSendError>;
    readonly sendBatch: (
      messages: ReadonlyArray<WhatsAppMessage>,
    ) => Effect.Effect<ReadonlyArray<WhatsAppSendResult>, WhatsAppSendError>;
  }
>()("@thomasfosterau/effect-connect/WhatsAppService") {
  /**
   * A recording double: every send succeeds and is appended to `sent`, so a
   * test can assert what would have gone out without a network seam at all.
   * Results carry `recorded-<n>` ids, numbered from 1 in send order.
   *
   * @since 0.1.0
   */
  static readonly layerRecording = (sent: Array<WhatsAppMessage>): Layer.Layer<WhatsAppService> =>
    Layer.sync(WhatsAppService, () => recordingSender(sent));
}

/**
 * Send one WhatsApp message through the {@link WhatsAppService} in context.
 *
 * @example
 * ```ts
 * import * as assert from "node:assert";
 * import * as Effect from "effect/Effect";
 * import * as Option from "effect/Option";
 * import {
 *   WhatsAppService,
 *   sendWhatsApp,
 *   type WhatsAppMessage,
 * } from "@thomasfosterau/effect-connect";
 *
 * const sent: Array<WhatsAppMessage> = [];
 *
 * const result = Effect.runSync(
 *   sendWhatsApp({
 *     _tag: "Template",
 *     to: "+61412345678",
 *     template: { id: "HX0123", variables: { "1": "123456" } },
 *   }).pipe(Effect.provide(WhatsAppService.layerRecording(sent))),
 * );
 *
 * assert.strictEqual(sent.length, 1);
 * assert.ok(Option.isSome(result.id));
 * ```
 *
 * @since 0.1.0
 */
export const sendWhatsApp = (
  message: WhatsAppMessage,
): Effect.Effect<WhatsAppSendResult, WhatsAppSendError, WhatsAppService> =>
  Effect.flatMap(WhatsAppService, (service) => service.send(message));

/**
 * Send several WhatsApp messages through the {@link WhatsAppService} in
 * context.
 *
 * @since 0.1.0
 */
export const sendWhatsAppBatch = (
  messages: ReadonlyArray<WhatsAppMessage>,
): Effect.Effect<ReadonlyArray<WhatsAppSendResult>, WhatsAppSendError, WhatsAppService> =>
  Effect.flatMap(WhatsAppService, (service) => service.sendBatch(messages));
