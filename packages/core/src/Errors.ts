/**
 * The failures the channel contracts (`EmailService`, `SmsService`,
 * `WhatsAppService`, `ChatService`) admit, and the vendor-body bound every provider applies
 * to them.
 *
 * All are schema-backed (`Schema.TaggedError`), so they serialise across a
 * queue or a Worker binding and pattern-match on `_tag`.
 *
 * @module Errors
 * @since 0.1.0
 */

import * as Schema from "effect/Schema";

/**
 * How much of a vendor's error body a send error ({@link EmailSendError},
 * {@link SmsSendError}, {@link WhatsAppSendError},
 * {@link ChatSendError}) carries.
 *
 * A vendor error response can echo request context back — headers, the
 * message it rejected — so a provider never embeds one raw and unbounded in
 * an error message; it truncates to this many characters first
 * ({@link truncateUpstreamBody}). The credential never appears in one at all.
 *
 * @since 0.1.0
 */
export const UPSTREAM_BODY_LIMIT = 200;

/**
 * Bound a vendor error body before it can reach a log line.
 *
 * @since 0.1.0
 */
export const truncateUpstreamBody = (body: string): string => body.slice(0, UPSTREAM_BODY_LIMIT);

/**
 * A provider failed to send. `provider` names which one; `status` is the
 * vendor's HTTP status when it answered at all (transport failures carry
 * `none`; it encodes as an optional key, so the error serialises as plain
 * JSON); `message` is a one-line summary safe to log; `cause` is the
 * underlying error for diagnostics.
 *
 * @since 0.1.0
 */
export class EmailSendError extends Schema.TaggedError<EmailSendError>()("EmailSendError", {
  provider: Schema.String,
  message: Schema.String,
  status: Schema.OptionFromOptionalKey(Schema.Int),
  cause: Schema.optionalKey(Schema.Defect()),
}) {}

/**
 * An untrusted value did not decode as an `EmailMessage`
 * (`decodeEmailMessage`). `issues` lists each schema issue as one line.
 *
 * @since 0.1.0
 */
export class EmailValidationError extends Schema.TaggedError<EmailValidationError>()(
  "EmailValidationError",
  {
    message: Schema.String,
    issues: Schema.Array(Schema.String),
  },
) {}

/**
 * An SMS provider failed to send. The same shape as {@link EmailSendError}:
 * `provider` names which one; `status` is the vendor's HTTP status when it
 * answered at all (`none` for transport failures, and for a send refused
 * before any request was made); `message` is a one-line summary safe to log
 * (never the message body, which is often a one-time code); `cause` is the
 * underlying error for diagnostics.
 *
 * @since 0.1.0
 */
export class SmsSendError extends Schema.TaggedError<SmsSendError>()("SmsSendError", {
  provider: Schema.String,
  message: Schema.String,
  status: Schema.OptionFromOptionalKey(Schema.Int),
  cause: Schema.optionalKey(Schema.Defect()),
}) {}

/**
 * An untrusted value did not decode as an `SmsMessage`
 * (`decodeSmsMessage`). `issues` lists each schema issue as one line.
 *
 * @since 0.1.0
 */
export class SmsValidationError extends Schema.TaggedError<SmsValidationError>()(
  "SmsValidationError",
  {
    message: Schema.String,
    issues: Schema.Array(Schema.String),
  },
) {}

/**
 * A WhatsApp provider failed to send. The same shape as {@link SmsSendError}:
 * `provider` names which one; `status` is the vendor's HTTP status when it
 * answered at all (`none` for transport failures, and for a send refused
 * before any request was made); `message` is a one-line summary safe to log
 * (never the message body nor a template's variables, either of which can
 * carry a one-time code); `cause` is the underlying error for diagnostics.
 *
 * @since 0.1.0
 */
export class WhatsAppSendError extends Schema.TaggedError<WhatsAppSendError>()(
  "WhatsAppSendError",
  {
    provider: Schema.String,
    message: Schema.String,
    status: Schema.OptionFromOptionalKey(Schema.Int),
    cause: Schema.optionalKey(Schema.Defect()),
  },
) {}

/**
 * An untrusted value did not decode as a `WhatsAppMessage`
 * (`decodeWhatsAppMessage`). `issues` lists each schema issue as one line.
 *
 * @since 0.1.0
 */
export class WhatsAppValidationError extends Schema.TaggedError<WhatsAppValidationError>()(
  "WhatsAppValidationError",
  {
    message: Schema.String,
    issues: Schema.Array(Schema.String),
  },
) {}

/**
 * A chat provider failed to post. The same shape as {@link EmailSendError}:
 * `provider` names which one; `status` is the vendor's HTTP status when it
 * answered at all (`none` for transport failures, and for a send refused
 * before any request was made — a webhook URL that is not the vendor's);
 * `message` is a one-line summary safe to log (never the webhook URL, which
 * is the credential, and never the message text); `cause` is the underlying
 * error for diagnostics, when it carries neither.
 *
 * @since 0.1.0
 */
export class ChatSendError extends Schema.TaggedError<ChatSendError>()("ChatSendError", {
  provider: Schema.String,
  message: Schema.String,
  status: Schema.OptionFromOptionalKey(Schema.Int),
  cause: Schema.optionalKey(Schema.Defect()),
}) {}

/**
 * An untrusted value did not decode as a `ChatMessage`
 * (`decodeChatMessage`). `issues` lists each schema issue as one line.
 *
 * @since 0.1.0
 */
export class ChatValidationError extends Schema.TaggedError<ChatValidationError>()(
  "ChatValidationError",
  {
    message: Schema.String,
    issues: Schema.Array(Schema.String),
  },
) {}
