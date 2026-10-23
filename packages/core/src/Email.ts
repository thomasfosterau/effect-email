/**
 * The message model every provider sends: addresses, recipients, attachments,
 * the message itself and the result of a send.
 *
 * Provider-agnostic on purpose. A provider maps this shape onto its wire
 * format (SendGrid personalizations, Resend's flat JSON) and never leaks its
 * own vocabulary back into it — see the package `CLAUDE.md`.
 *
 * @module Email
 * @since 0.1.0
 */

import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { EmailValidationError } from "./Errors.ts";
import { issueLines } from "./internal/issues.ts";

/**
 * An email address: a syntactic check only (`local@domain.tld`), the same
 * pattern the original scaffold validated. Deliverability is the provider's
 * verdict, not the schema's.
 *
 * @since 0.1.0
 */
export const EmailAddress = Schema.String.pipe(
  Schema.check(
    Schema.isPattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, {
      title: "EmailAddress",
      description: "an email address of the form local@domain.tld",
    }),
  ),
);
/**
 * The decoded type of the {@link EmailAddress} schema.
 *
 * @since 0.1.0
 */
export type EmailAddress = typeof EmailAddress.Type;

/**
 * A recipient (or sender): an address with an optional display name.
 *
 * @since 0.1.0
 */
export const Recipient = Schema.Struct({
  email: EmailAddress,
  name: Schema.optionalKey(Schema.String),
});
/**
 * The decoded type of the {@link Recipient} schema.
 *
 * @since 0.1.0
 */
export type Recipient = typeof Recipient.Type;

/**
 * An attachment. `content` is the file's bytes, base64-encoded.
 *
 * @since 0.1.0
 */
export const Attachment = Schema.Struct({
  filename: Schema.String,
  content: Schema.String,
  contentType: Schema.String,
});
/**
 * The decoded type of the {@link Attachment} schema.
 *
 * @since 0.1.0
 */
export type Attachment = typeof Attachment.Type;

/**
 * One message to send.
 *
 * At least one of `text` / `html` is expected by every provider; the schema
 * does not enforce it because a template-driven provider send (SendGrid
 * dynamic templates) legitimately carries neither. `headers` are custom
 * headers to set on the outgoing message; `tags` are provider-side labels
 * for analytics (SendGrid categories, Resend tags).
 *
 * @since 0.1.0
 */
export const EmailMessage = Schema.Struct({
  from: Recipient,
  to: Schema.NonEmptyArray(Recipient),
  cc: Schema.optionalKey(Schema.Array(Recipient)),
  bcc: Schema.optionalKey(Schema.Array(Recipient)),
  replyTo: Schema.optionalKey(Recipient),
  subject: Schema.String,
  text: Schema.optionalKey(Schema.String),
  html: Schema.optionalKey(Schema.String),
  attachments: Schema.optionalKey(Schema.Array(Attachment)),
  headers: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  tags: Schema.optionalKey(Schema.Array(Schema.String)),
});
/**
 * The decoded type of the {@link EmailMessage} schema.
 *
 * @since 0.1.0
 */
export type EmailMessage = typeof EmailMessage.Type;

/**
 * What a provider answers for one accepted message: the provider's message
 * id when it gives one (Resend always does; SendGrid's `X-Message-Id` header
 * is present on real responses but nothing guarantees it). Encodes as an
 * optional `id` key, so a result serialises as plain JSON.
 *
 * @since 0.1.0
 */
export const EmailSendResult = Schema.Struct({
  id: Schema.OptionFromOptionalKey(Schema.String),
});
/**
 * The decoded type of the {@link EmailSendResult} schema.
 *
 * @since 0.1.0
 */
export type EmailSendResult = typeof EmailSendResult.Type;

/**
 * Decode an untrusted value into an {@link EmailMessage}, failing with an
 * {@link EmailValidationError} that lists each issue as one line.
 *
 * The typed `send` needs no validation — the type is the contract — so this
 * is for the boundary where a message is assembled from request input,
 * queue payloads or configuration.
 *
 * @example
 * ```ts
 * import * as assert from "node:assert";
 * import * as Effect from "effect/Effect";
 * import * as Exit from "effect/Exit";
 * import { decodeEmailMessage } from "@thomasfosterau/effect-connect";
 *
 * const valid = Effect.runSyncExit(
 *   decodeEmailMessage({
 *     from: { email: "noreply@example.com" },
 *     to: [{ email: "reader@example.com" }],
 *     subject: "Welcome",
 *   }),
 * );
 * assert.ok(Exit.isSuccess(valid));
 *
 * const invalid = Effect.runSyncExit(
 *   decodeEmailMessage({ from: { email: "not-an-address" }, to: [], subject: "Welcome" }),
 * );
 * assert.ok(Exit.isFailure(invalid));
 * ```
 *
 * @since 0.1.0
 */
export const decodeEmailMessage = (
  // oxlint-disable-next-line effect/no-unknown-parameters -- this IS the I/O boundary: the whole point of the function is to run the schema over unparsed input
  input: unknown,
): Effect.Effect<EmailMessage, EmailValidationError> =>
  Schema.decodeUnknownEffect(EmailMessage, { errors: "all" })(input).pipe(
    Effect.mapError(
      (error) =>
        new EmailValidationError({
          message: "The email message is invalid",
          issues: issueLines(error),
        }),
    ),
  );

/**
 * Every address a message is delivered to: `to`, `cc` and `bcc`, in that order.
 *
 * @since 0.1.0
 */
export const recipientAddresses = (message: EmailMessage): ReadonlyArray<EmailAddress> =>
  [...message.to, ...(message.cc ?? []), ...(message.bcc ?? [])].map(
    (recipient) => recipient.email,
  );
