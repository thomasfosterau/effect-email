---
"@thomasfosterau/effect-connect": minor
"@thomasfosterau/effect-connect-resend": minor
---

Initial release, on Effect `4.0.0-rc.118`. The `effect` peer floor is `>=4.0.0-rc.118`: the packages import `effect/http/*`, which earlier rc releases spell `effect/unstable/http/*`.

Under rc.118's `ConfigProvider` an empty environment variable counts as missing, so the Resend package's `layerConfig` falls back to the default base URL when `*_BASE_URL` is `""`, and Resend's `layerConfig` fails at layer construction with a `ConfigError` when `RESEND_API_KEY` is `""` or unset.

`@thomasfosterau/effect-connect` (peer: `effect`) — the provider-agnostic core:

- `EmailAddress`, `Recipient`, `Attachment`, `EmailMessage`, `EmailSendResult` as `effect/Schema` schemas.
- `EmailService` (`Context.Service`: `send`, `sendBatch`), the `send` / `sendBatch` accessors and `EmailService.layerRecording(sent)` test double.
- `EmailSendError` / `EmailValidationError` (`Schema.TaggedError`), `decodeEmailMessage`, `recipientAddresses`, `truncateUpstreamBody`.

`@thomasfosterau/effect-connect-resend` (peer: `effect`; depends on the core) — the Resend provider, the library form of the applications' hand-rolled `POST /emails` senders:

- `layer` / `layerConfig` over `effect/http` with a `Redacted` key, `redirect: "error"` pinned on the fetch, truncated error bodies, `POST /emails/batch` for `sendBatch`.
- `noop` (succeeds, logs the subject only) and `resolveTransport(env)` / `apiKeyFromEnv`; `toResendPayload`, `formatAddress`, `ResendSendPayload`.
