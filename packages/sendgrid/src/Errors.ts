/**
 * The failures the SendGrid client admits, beyond the core's
 * `EmailSendError` (which the mail sender maps them onto).
 *
 * @module Errors
 */

import * as Schema from "effect/Schema";

/**
 * The configured API key is blank. Raised at call time, not at layer
 * construction, so a stage without a credential still boots — the same
 * posture the original `effect-sendgrid` wrapper pinned in its suite.
 */
export class InvalidApiKeyError extends Schema.TaggedError<InvalidApiKeyError>()(
  "InvalidApiKeyError",
  {
    message: Schema.String,
  },
) {}

/**
 * A SendGrid API request failed. `status` is SendGrid's HTTP status when it
 * answered at all (`none` for transport failures and un-encodable bodies);
 * `message` carries the status and a **truncated** upstream body — never the
 * raw one, never the credential.
 */
export class SendGridClientError extends Schema.TaggedError<SendGridClientError>()(
  "SendGridClientError",
  {
    message: Schema.String,
    status: Schema.OptionFromOptionalKey(Schema.Int),
    cause: Schema.optionalKey(Schema.Defect()),
  },
) {}
