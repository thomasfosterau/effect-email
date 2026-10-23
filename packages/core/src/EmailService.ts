/**
 * The service every provider implements and every consumer sends through.
 *
 * A consumer yields {@link EmailService} (or calls the {@link send} /
 * {@link sendBatch} accessors) and provides one provider's layer at the
 * edge; swapping SendGrid for Resend is a one-line layer change. The
 * recording layer is the test double both the providers' own suites and a
 * consumer's use: nothing leaves the process, and the test reads back what
 * would have gone out.
 *
 * @module EmailService
 * @since 0.1.0
 */

import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import type { EmailMessage, EmailSendResult } from "./Email.ts";
import type { EmailSendError } from "./Errors.ts";

/**
 * The transactional-email sender as an Effect service: the operations a
 * provider implements.
 *
 * - `send` — send one message. Fails `EmailSendError`; never throws.
 * - `sendBatch` — send several messages, one result per message, in order. A
 *   provider with a real batch endpoint uses it; one without sends
 *   concurrently. The whole batch fails on the first failure — a caller that
 *   wants per-message outcomes calls `send` once per message (a batching
 *   wrapper such as `@thomasfosterau/effect-connect-sendgrid`'s `send` regroups
 *   them into one `sendBatch`).
 *
 * @since 0.1.0
 */
export class EmailService extends Context.Service<
  EmailService,
  {
    readonly send: (message: EmailMessage) => Effect.Effect<EmailSendResult, EmailSendError>;
    readonly sendBatch: (
      messages: ReadonlyArray<EmailMessage>,
    ) => Effect.Effect<ReadonlyArray<EmailSendResult>, EmailSendError>;
  }
>()("@thomasfosterau/effect-connect/EmailService") {
  /**
   * A recording double: every send succeeds and is appended to `sent`, so a
   * test can assert what would have gone out without a network seam at all.
   * Results carry `recorded-<n>` ids, numbered from 1 in send order.
   *
   * @since 0.1.0
   */
  static readonly layerRecording = (sent: Array<EmailMessage>): Layer.Layer<EmailService> =>
    Layer.sync(EmailService, () => {
      const record = (message: EmailMessage): EmailSendResult => {
        sent.push(message);
        return { id: Option.some(`recorded-${sent.length}`) };
      };
      return {
        send: (message) => Effect.sync(() => record(message)),
        sendBatch: (messages) => Effect.sync(() => messages.map(record)),
      };
    });
}

/**
 * Send one message through the {@link EmailService} in context.
 *
 * @example
 * ```ts
 * import * as assert from "node:assert";
 * import * as Effect from "effect/Effect";
 * import * as Option from "effect/Option";
 * import { EmailService, send, type EmailMessage } from "@thomasfosterau/effect-connect";
 *
 * const sent: Array<EmailMessage> = [];
 *
 * const result = Effect.runSync(
 *   send({
 *     from: { email: "noreply@example.com", name: "Example" },
 *     to: [{ email: "reader@example.com" }],
 *     subject: "Welcome",
 *     text: "Hello!",
 *   }).pipe(Effect.provide(EmailService.layerRecording(sent))),
 * );
 *
 * assert.strictEqual(sent.length, 1);
 * assert.ok(Option.isSome(result.id));
 * ```
 *
 * @since 0.1.0
 */
export const send = (
  message: EmailMessage,
): Effect.Effect<EmailSendResult, EmailSendError, EmailService> =>
  Effect.flatMap(EmailService, (service) => service.send(message));

/**
 * Send several messages through the {@link EmailService} in context.
 *
 * @since 0.1.0
 */
export const sendBatch = (
  messages: ReadonlyArray<EmailMessage>,
): Effect.Effect<ReadonlyArray<EmailSendResult>, EmailSendError, EmailService> =>
  Effect.flatMap(EmailService, (service) => service.sendBatch(messages));
