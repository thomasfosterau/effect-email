---
"@thomasfosterau/effect-connect": minor
"@thomasfosterau/effect-connect-resend": minor
---

The packages ship as effect-connect, a messaging abstraction over email and SMS: `@thomasfosterau/effect-connect` (the core, formerly `@thomasfosterau/effect-email`) and `@thomasfosterau/effect-connect-resend`. None was published under the old names. Every `Context.Service` key moves to the new package names (`@thomasfosterau/effect-connect/EmailService`, …), and the Resend no-op logs under `[effect-connect-resend]`.

The core adds an SMS channel beside email, as its own service:

- `PhoneNumber` (E.164), `SmsSender` (E.164, short code or alphanumeric sender ID), `SmsMessage` (`{ to, from?, body }`), `SmsSendResult` as `effect/Schema` schemas.
- `SmsService` (`Context.Service`: `send`, `sendBatch`), the `sendSms` / `sendSmsBatch` accessors and `SmsService.layerRecording(sent)`.
- `SmsSendError` / `SmsValidationError` (`Schema.TaggedError`) and `decodeSmsMessage`.
