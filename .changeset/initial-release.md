---
"@thomasfosterau/effect-email": minor
"@thomasfosterau/effect-email-sendgrid": minor
"@thomasfosterau/effect-email-resend": minor
---

Initial release, on Effect `4.0.0-rc.118`. The `effect` peer floor is `>=4.0.0-rc.118`: the packages import `effect/http/*`, which earlier rc releases spell `effect/unstable/http/*`.

Under rc.118's `ConfigProvider` an empty environment variable counts as missing, so `layerConfig` in the SendGrid and Resend packages falls back to the default base URL when `*_BASE_URL` is `""`, and fails at layer construction with a `ConfigError` when the API key variable is `""` or unset. `layer({ apiKey })` with an empty key still builds; SendGrid then fails each call with `InvalidApiKeyError`.

`@thomasfosterau/effect-email` (peer: `effect`) — the provider-agnostic core:

- `EmailAddress`, `Recipient`, `Attachment`, `EmailMessage`, `EmailSendResult` as `effect/Schema` schemas.
- `EmailService` (`Context.Service`: `send`, `sendBatch`), the `send` / `sendBatch` accessors and `EmailService.layerRecording(sent)` test double.
- `EmailSendError` / `EmailValidationError` (`Schema.TaggedError`), `decodeEmailMessage`, `recipientAddresses`, `truncateUpstreamBody`.

`@thomasfosterau/effect-email-sendgrid` (peer: `effect`; depends on the core) — the SendGrid provider, absorbing `thomasfosterau/effect-sendgrid`:

- `layer` / `layerConfig` providing the core `EmailService` and `SendGridClient` over `effect/http` (no `@sendgrid/*` SDK).
- The batched `send` / `sendMany` (`Request` + `RequestResolver`, kept from effect-sendgrid), `toMailSendPayload`, `MailSendPayload`.
- `SendGridClient.request` / `requestJson` and the `Template`, `Contact`, `ApiKey`, `UserProfile` helpers; `SendGridClientError`, `InvalidApiKeyError`.

`@thomasfosterau/effect-email-resend` (peer: `effect`; depends on the core) — the Resend provider, the library form of the applications' hand-rolled `POST /emails` senders:

- `layer` / `layerConfig` over `effect/http` with a `Redacted` key, `redirect: "error"` pinned on the fetch, truncated error bodies, `POST /emails/batch` for `sendBatch`.
- `noop` (succeeds, logs the subject only) and `resolveTransport(env)` / `apiKeyFromEnv`; `toResendPayload`, `formatAddress`, `ResendSendPayload`.
