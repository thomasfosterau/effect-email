---
"@thomasfosterau/effect-connect": minor
"@thomasfosterau/effect-connect-sendgrid": minor
"@thomasfosterau/effect-connect-resend": minor
"@thomasfosterau/effect-connect-twilio": minor
---

The packages ship as effect-connect, a messaging abstraction over email and SMS: `@thomasfosterau/effect-connect` (the core, formerly `@thomasfosterau/effect-email`), `@thomasfosterau/effect-connect-sendgrid` and `@thomasfosterau/effect-connect-resend`. None was published under the old names. Every `Context.Service` key moves to the new package names (`@thomasfosterau/effect-connect/EmailService`, `@thomasfosterau/effect-connect-sendgrid/SendGridClient`, …), and the Resend no-op logs under `[effect-connect-resend]`.

The core adds an SMS channel beside email, as its own service:

- `PhoneNumber` (E.164), `SmsSender` (E.164, short code or alphanumeric sender ID), `SmsMessage` (`{ to, from?, body }`), `SmsSendResult` as `effect/Schema` schemas.
- `SmsService` (`Context.Service`: `send`, `sendBatch`), the `sendSms` / `sendSmsBatch` accessors and `SmsService.layerRecording(sent)`.
- `SmsSendError` / `SmsValidationError` (`Schema.TaggedError`) and `decodeSmsMessage`.

`@thomasfosterau/effect-connect-twilio` (peer: `effect`; depends on the core) is the first SMS provider: Twilio Programmable Messaging over `effect/http` with no SDK.

- `layer` / `layerConfig` (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, optional `TWILIO_API_KEY_SID`, `TWILIO_FROM`, `TWILIO_MESSAGING_SERVICE_SID`, `TWILIO_BASE_URL`) with a `Redacted` auth token or API key secret, a default sender or Messaging Service, `redirect: "error"` pinned on the fetch, an account SID validated before it reaches the URL path, and truncated error bodies. `sendBatch` sends one request per message, four at a time.
- `noop` (succeeds, logs neither the number nor the body) and `resolveTransport(env)` / `configFromEnv`; `toTwilioParams`, `TwilioMessageParams`.
