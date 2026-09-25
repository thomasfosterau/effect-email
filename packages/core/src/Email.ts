/**
 * The message model every provider sends: addresses, recipients, attachments,
 * the message itself and the result of a send.
 *
 * Provider-agnostic on purpose. A provider maps this shape onto its wire
 * format (SendGrid personalizations, Resend's flat JSON) and never leaks its
 * own vocabulary back into it — see the package `CLAUDE.md`.
 *
 * @module Email
 */

import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as SchemaIssue from "effect/SchemaIssue";
import * as Str from "effect/String";
import { EmailValidationError } from "./Errors.ts";

/** Effect's default (tree) issue formatter, one line per leaf issue. */
const formatIssue: (issue: SchemaIssue.Issue) => string = SchemaIssue.makeFormatterDefault();

/**
 * An email address: a syntactic check only (`local@domain.tld`), the same
 * pattern the original scaffold validated. Deliverability is the provider's
 * verdict, not the schema's.
 */
export const EmailAddress = Schema.String.pipe(
  Schema.check(
    Schema.isPattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, {
      title: "EmailAddress",
      description: "an email address of the form local@domain.tld",
    }),
  ),
);
export type EmailAddress = typeof EmailAddress.Type;

/** A recipient (or sender): an address with an optional display name. */
export const Recipient = Schema.Struct({
  email: EmailAddress,
  name: Schema.optionalKey(Schema.String),
});
export type Recipient = typeof Recipient.Type;

/** An attachment. `content` is the file's bytes, base64-encoded. */
export const Attachment = Schema.Struct({
  filename: Schema.String,
  content: Schema.String,
  contentType: Schema.String,
});
export type Attachment = typeof Attachment.Type;

/**
 * One message to send.
 *
 * At least one of `text` / `html` is expected by every provider; the schema
 * does not enforce it because a template-driven provider send (SendGrid
 * dynamic templates) legitimately carries neither. `headers` are custom
 * headers to set on the outgoing message; `tags` are provider-side labels
 * for analytics (SendGrid categories, Resend tags).
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
export type EmailMessage = typeof EmailMessage.Type;

/**
 * What a provider answers for one accepted message: the provider's message
 * id when it gives one (Resend always does; SendGrid's `X-Message-Id` header
 * is present on real responses but nothing guarantees it). Encodes as an
 * optional `id` key, so a result serialises as plain JSON.
 */
export const EmailSendResult = Schema.Struct({
  id: Schema.OptionFromOptionalKey(Schema.String),
});
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
 * import * as Effect from "effect/Effect";
 * import * as Exit from "effect/Exit";
 * import { decodeEmailMessage } from "@thomasfosterau/effect-email";
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
          issues: formatIssue(error.issue)
            .split("\n")
            .map((line: string) => line.trimEnd())
            .filter(Str.isNonEmpty),
        }),
    ),
  );

/** Every address a message is delivered to: `to`, `cc` and `bcc`, in that order. */
export const recipientAddresses = (message: EmailMessage): ReadonlyArray<EmailAddress> =>
  [...message.to, ...(message.cc ?? []), ...(message.bcc ?? [])].map(
    (recipient) => recipient.email,
  );
