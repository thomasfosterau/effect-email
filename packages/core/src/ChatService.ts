/**
 * The service every chat provider implements and every consumer posts chat
 * messages through — the chat counterpart of `EmailService` and
 * `SmsService`, with the same shape.
 *
 * A separate service per channel: an application that posts to chat but
 * sends no email never provides an email layer, and a missing chat provider
 * is a type error at the edge rather than a runtime failure at the first
 * send.
 *
 * @module ChatService
 * @since 0.1.0
 */

import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type { ChatMessage, ChatSendResult } from "./Chat.ts";
import type { ChatSendError } from "./Errors.ts";
import { recordingSender } from "./internal/recording.ts";

/**
 * The chat sender as an Effect service: the operations a provider implements.
 *
 * - `send` — post one message. Fails `ChatSendError`; never throws.
 * - `sendBatch` — post several messages, one result per message, in order.
 *   A chat channel shows messages in the order they arrive, so a provider
 *   without a batch endpoint posts them one at a time. The whole batch fails
 *   on the first failure — a caller that wants per-message outcomes calls
 *   `send` once per message.
 *
 * @since 0.1.0
 */
export class ChatService extends Context.Service<
  ChatService,
  {
    readonly send: (message: ChatMessage) => Effect.Effect<ChatSendResult, ChatSendError>;
    readonly sendBatch: (
      messages: ReadonlyArray<ChatMessage>,
    ) => Effect.Effect<ReadonlyArray<ChatSendResult>, ChatSendError>;
  }
>()("@thomasfosterau/effect-connect/ChatService") {
  /**
   * A recording double: every send succeeds and is appended to `sent`, so a
   * test can assert what would have gone out without a network seam at all.
   * Results carry `recorded-<n>` ids, numbered from 1 in send order.
   *
   * @since 0.1.0
   */
  static readonly layerRecording = (sent: Array<ChatMessage>): Layer.Layer<ChatService> =>
    Layer.sync(ChatService, () => recordingSender(sent));
}

/**
 * Post one chat message through the {@link ChatService} in context.
 *
 * @example
 * ```ts
 * import * as assert from "node:assert";
 * import * as Effect from "effect/Effect";
 * import * as Option from "effect/Option";
 * import { ChatService, sendChat, type ChatMessage } from "@thomasfosterau/effect-connect";
 *
 * const sent: Array<ChatMessage> = [];
 *
 * const result = Effect.runSync(
 *   sendChat({ text: "Deploy finished" }).pipe(Effect.provide(ChatService.layerRecording(sent))),
 * );
 *
 * assert.strictEqual(sent.length, 1);
 * assert.ok(Option.isSome(result.id));
 * ```
 *
 * @since 0.1.0
 */
export const sendChat = (
  message: ChatMessage,
): Effect.Effect<ChatSendResult, ChatSendError, ChatService> =>
  Effect.flatMap(ChatService, (service) => service.send(message));

/**
 * Post several chat messages, in order, through the {@link ChatService} in
 * context.
 *
 * @since 0.1.0
 */
export const sendChatBatch = (
  messages: ReadonlyArray<ChatMessage>,
): Effect.Effect<ReadonlyArray<ChatSendResult>, ChatSendError, ChatService> =>
  Effect.flatMap(ChatService, (service) => service.sendBatch(messages));
