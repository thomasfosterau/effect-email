/**
 * The mail sender: the core `EmailMessage` mapped onto SendGrid's v3
 * `POST /v3/mail/send` payload, the core `EmailService` implemented over the
 * {@link SendGridClient}, and the batched `send` — a `Request` /
 * `RequestResolver` pair so concurrent sends collapse into one `sendBatch`
 * call on the service.
 *
 * @module Mail
 */

import * as Arr from "effect/Array";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Match from "effect/Match";
import * as Option from "effect/Option";
import * as Request from "effect/Request";
import * as RequestResolver from "effect/RequestResolver";
import * as Schema from "effect/Schema";
import {
  EmailSendError,
  EmailService,
  type EmailMessage,
  type EmailSendResult,
} from "@thomasfosterau/effect-email";
import type { InvalidApiKeyError, SendGridClientError } from "./Errors.ts";
import { SendGridClient } from "./SendGridClient.ts";

/** An address as SendGrid spells it — the same shape as the core `Recipient`. */
const Address = Schema.Struct({
  email: Schema.String,
  name: Schema.optionalKey(Schema.String),
});

/** One personalization: the envelope for one delivery. */
const Personalization = Schema.Struct({
  to: Schema.NonEmptyArray(Address),
  cc: Schema.optional(Schema.Array(Address)),
  bcc: Schema.optional(Schema.Array(Address)),
});

const Content = Schema.Struct({
  type: Schema.Literals(["text/plain", "text/html"]),
  value: Schema.String,
});
type Content = typeof Content.Type;

const AttachmentPayload = Schema.Struct({
  content: Schema.String,
  filename: Schema.String,
  type: Schema.String,
  disposition: Schema.Literals(["attachment", "inline"]),
});

/**
 * The wire payload of `POST /v3/mail/send`, stated once and checked against
 * what `EmailMessage` carries. Optional members are `Schema.optional` rather
 * than `optionalKey` on purpose: the mapping assigns `undefined` for an
 * absent message field and JSON encoding drops the key.
 */
export const MailSendPayload = Schema.Struct({
  personalizations: Schema.NonEmptyArray(Personalization),
  from: Address,
  reply_to: Schema.optional(Address),
  subject: Schema.String,
  content: Schema.optional(Schema.Array(Content)),
  attachments: Schema.optional(Schema.Array(AttachmentPayload)),
  headers: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  categories: Schema.optional(Schema.Array(Schema.String)),
});
export type MailSendPayload = typeof MailSendPayload.Type;

/** `text/plain` first, then `text/html`: the order SendGrid requires. */
// oxlint-disable-next-line effect/prefer-option-over-null -- feeds a `Schema.optional` payload member: `undefined` is what JSON encoding drops, an `Option` would be serialised as a value
const contentOf = (message: EmailMessage): ReadonlyArray<Content> | undefined => {
  const parts = Arr.getSomes([
    Option.map(Option.fromNullishOr(message.text), (value) => ({
      type: "text/plain" as const,
      value,
    })),
    Option.map(Option.fromNullishOr(message.html), (value) => ({
      type: "text/html" as const,
      value,
    })),
  ]);
  return Arr.isReadonlyArrayNonEmpty(parts) ? parts : undefined;
};

/**
 * Map a core message onto SendGrid's mail-send payload: one personalization
 * carrying `to` / `cc` / `bcc`, `text` and `html` as `content` parts, core
 * `tags` as SendGrid `categories`, attachments with `disposition: attachment`.
 *
 * @example
 * ```ts
 * import { toMailSendPayload } from "@thomasfosterau/effect-email-sendgrid";
 *
 * const payload = toMailSendPayload({
 *   from: { email: "noreply@example.com", name: "Example" },
 *   to: [{ email: "reader@example.com" }],
 *   subject: "Welcome",
 *   text: "Hello!",
 *   html: "<p>Hello!</p>",
 *   tags: ["welcome"],
 * });
 *
 * assert.deepStrictEqual(payload.personalizations[0].to, [{ email: "reader@example.com" }]);
 * assert.deepStrictEqual(
 *   payload.content?.map((part) => part.type),
 *   ["text/plain", "text/html"],
 * );
 * assert.deepStrictEqual(payload.categories, ["welcome"]);
 * ```
 */
export const toMailSendPayload = (message: EmailMessage): MailSendPayload => ({
  personalizations: [{ to: message.to, cc: message.cc, bcc: message.bcc }],
  from: message.from,
  reply_to: message.replyTo,
  subject: message.subject,
  content: contentOf(message),
  attachments: message.attachments?.map((attachment) => ({
    content: attachment.content,
    filename: attachment.filename,
    type: attachment.contentType,
    disposition: "attachment" as const,
  })),
  headers: message.headers,
  categories: message.tags,
});

const toSendError = (error: SendGridClientError | InvalidApiKeyError): EmailSendError =>
  new EmailSendError({
    provider: "sendgrid",
    message: error.message,
    status: Match.value(error).pipe(
      Match.tag("SendGridClientError", (clientError) => clientError.status),
      Match.orElse(() => Option.none()),
    ),
    cause: error,
  });

/** How many messages `sendBatch` has in flight at once. */
const BATCH_CONCURRENCY = 8;

/**
 * The core `EmailService` implemented over the {@link SendGridClient} in
 * context. `sendBatch` sends concurrently (SendGrid's mail-send endpoint
 * takes one message per request), bounded to a modest concurrency.
 */
export const layerEmailService: Layer.Layer<EmailService, never, SendGridClient> = Layer.effect(
  EmailService,
  Effect.gen(function* () {
    const client = yield* SendGridClient;

    const send = Effect.fn("SendGrid.send")(function* (message: EmailMessage) {
      const response = yield* client
        .request({ url: "/v3/mail/send", method: "POST", body: toMailSendPayload(message) })
        .pipe(Effect.mapError(toSendError));
      // SendGrid answers 202 with an empty body; the message id is a header.
      const result: EmailSendResult = {
        id: Option.fromNullishOr(response.headers["x-message-id"]),
      };
      return result;
    });

    const sendBatch = (messages: ReadonlyArray<EmailMessage>) =>
      Effect.forEach(messages, send, { concurrency: BATCH_CONCURRENCY });

    return { send, sendBatch };
  }),
);

/**
 * One batched send. Requires the `EmailService` the resolver reads from the
 * entry's context, so a `send` batches against whichever provider is in
 * context — in this package, the SendGrid one.
 */
export class SendEmailRequest extends Request.TaggedClass("SendEmailRequest")<
  { readonly message: EmailMessage },
  EmailSendResult,
  EmailSendError,
  EmailService
> {}

/**
 * The batched resolver: every `SendEmailRequest` collected in one batch
 * window (grouped by the `EmailService` instance in its context) becomes one
 * `sendBatch` call, and each entry completes with its own result — or, when
 * the batch fails, with the batch's failure.
 */
const sendEmailResolver = RequestResolver.makeGrouped<
  SendEmailRequest,
  typeof EmailService.Service
>({
  key: (entry) => Context.get(entry.context, EmailService),
  resolver: (entries, service) =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(
        service.sendBatch(entries.map((entry) => entry.request.message)),
      );
      yield* Effect.forEach(
        entries,
        (entry, index) =>
          Request.complete(
            entry,
            Exit.map(exit, (results) => results[index]),
          ),
        { concurrency: 1, discard: true },
      );
    }),
});

/**
 * Send one message through the batched resolver: concurrent `send`s in the
 * same batch window reach the `EmailService` as one `sendBatch` call.
 *
 * If any message in the window fails, every `send` in it fails with that
 * error, including messages SendGrid had already accepted, so retrying can
 * deliver duplicates. For per-message outcomes, call `EmailService.send` (or
 * the core `send` accessor), which this package doesn't batch.
 */
export const send = (
  message: EmailMessage,
): Effect.Effect<EmailSendResult, EmailSendError, EmailService> =>
  Effect.request(new SendEmailRequest({ message }), sendEmailResolver);

/**
 * Send several messages through the batched resolver, concurrently. Fails
 * as {@link send} does: one failure in a batch window fails the whole window.
 */
export const sendMany = (
  messages: ReadonlyArray<EmailMessage>,
): Effect.Effect<ReadonlyArray<EmailSendResult>, EmailSendError, EmailService> =>
  Effect.forEach(messages, send, { concurrency: "unbounded" });
