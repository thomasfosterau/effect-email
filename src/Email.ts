import * as Schema from "@effect/schema/Schema";

/**
 * Email address schema with validation
 */
export class EmailAddress extends Schema.String.pipe(
  Schema.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)
) {}

/**
 * Represents an email recipient with optional name
 */
export class Recipient extends Schema.Struct({
  email: EmailAddress,
  name: Schema.optional(Schema.String),
}) {}

/**
 * Email attachment
 */
export class Attachment extends Schema.Struct({
  filename: Schema.String,
  content: Schema.String, // Base64 encoded content
  contentType: Schema.String,
}) {}

/**
 * Core email message structure
 */
export class EmailMessage extends Schema.Struct({
  from: Recipient,
  to: Schema.Array(Recipient),
  cc: Schema.optional(Schema.Array(Recipient)),
  bcc: Schema.optional(Schema.Array(Recipient)),
  subject: Schema.String,
  text: Schema.optional(Schema.String),
  html: Schema.optional(Schema.String),
  attachments: Schema.optional(Schema.Array(Attachment)),
  replyTo: Schema.optional(Recipient),
  headers: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.String })),
  tags: Schema.optional(Schema.Array(Schema.String)),
}) {}

/**
 * Email send result
 */
export class EmailSendResult extends Schema.Struct({
  id: Schema.String,
  accepted: Schema.Array(EmailAddress),
  rejected: Schema.Array(EmailAddress),
}) {}
