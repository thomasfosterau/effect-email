/**
 * The failures the {@link EmailService} contract admits.
 *
 * Both are schema-backed (`Schema.TaggedError`), so they serialise across a
 * queue or a Worker binding and pattern-match on `_tag`.
 *
 * @module Errors
 */

import * as Schema from "effect/Schema";

/**
 * How much of a vendor's error body an {@link EmailSendError} carries.
 *
 * A vendor error response can echo request context back — headers, the
 * message it rejected — so a provider never embeds one raw and unbounded in
 * an error message; it truncates to this many characters first
 * ({@link truncateUpstreamBody}). The credential never appears in one at all.
 */
export const UPSTREAM_BODY_LIMIT = 200;

/** Bound a vendor error body before it can reach a log line. */
export const truncateUpstreamBody = (body: string): string => body.slice(0, UPSTREAM_BODY_LIMIT);

/**
 * A provider failed to send. `provider` names which one; `status` is the
 * vendor's HTTP status when it answered at all (transport failures carry
 * `none`; it encodes as an optional key, so the error serialises as plain
 * JSON); `message` is a one-line summary safe to log; `cause` is the
 * underlying error for diagnostics.
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
 */
export class EmailValidationError extends Schema.TaggedError<EmailValidationError>()(
  "EmailValidationError",
  {
    message: Schema.String,
    issues: Schema.Array(Schema.String),
  },
) {}
