/**
 * The failures the SendGrid client admits, beyond the core's
 * `EmailSendError` (which the mail sender maps them onto).
 *
 * @module Errors
 * @since 0.1.0
 */

import * as Schema from "effect/Schema";

/**
 * The configured API key is blank. Raised at call time by a provider built
 * with `layer({ apiKey })` and an empty key, so that layer still builds — the
 * posture the original `effect-sendgrid` wrapper pinned in its suite.
 * `layerConfig` builds the same way when `SENDGRID_API_KEY` is unset or empty.
 *
 * @since 0.1.0
 */
export class InvalidApiKeyError extends Schema.TaggedError<InvalidApiKeyError>()(
  "InvalidApiKeyError",
  {
    message: Schema.String,
  },
) {}

/**
 * A SendGrid API request failed. `status` is SendGrid's HTTP status when it
 * answered (any non-2xx, a 3xx included, or a response body that did not
 * match the expected schema); `none` for transport failures (a redirect the
 * client refused among them), un-encodable request bodies, and a request `url`
 * that is not a path on the configured host (refused before any request).
 * `message` carries the status and a **truncated** upstream body — never the
 * raw one, never the credential.
 *
 * @since 0.1.0
 */
export class SendGridClientError extends Schema.TaggedError<SendGridClientError>()(
  "SendGridClientError",
  {
    message: Schema.String,
    status: Schema.OptionFromOptionalKey(Schema.Int),
    cause: Schema.optionalKey(Schema.Defect()),
  },
) {}
