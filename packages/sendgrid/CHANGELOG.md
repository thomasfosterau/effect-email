# @thomasfosterau/effect-email-sendgrid

## 0.1.0

### Minor Changes

- [#11](https://github.com/thomasfosterau/effect-email/pull/11) [`36ecd31`](https://github.com/thomasfosterau/effect-email/commit/36ecd31031998ebd38933aaececc64d383c18b80) Thanks [@thomasfosterau](https://github.com/thomasfosterau)! - Initial release, on Effect `4.0.0-rc.118`. The `effect` peer floor is `>=4.0.0-rc.118`: the packages import `effect/http/*`, which earlier rc releases spell `effect/unstable/http/*`.

  Under rc.118's `ConfigProvider` an empty environment variable counts as missing, so `layerConfig` in the SendGrid and Resend packages falls back to the default base URL when `*_BASE_URL` is `""`, and Resend's `layerConfig` fails at layer construction with a `ConfigError` when `RESEND_API_KEY` is `""` or unset. SendGrid's `layerConfig`, like `layer({ apiKey })`, still builds with an empty or unset key; SendGrid then fails each call with `InvalidApiKeyError` (a send: `EmailSendError` with that `cause`).

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

### Patch Changes

- [#34](https://github.com/thomasfosterau/effect-email/pull/34) [`7d8ea4e`](https://github.com/thomasfosterau/effect-email/commit/7d8ea4ee126c1fa52d6399dda1e031455e8bcaa8) Thanks [@thomasfosterau](https://github.com/thomasfosterau)! - Doc comments state each provider's failure modes: Resend's `layerConfig` fails at layer construction with a `ConfigError` on an unset or empty API key variable; SendGrid's `InvalidApiKeyError` comes from a blank key, through `layer({ apiKey })` or `layerConfig`; `SendGridClientError` covers error answers and schema mismatches; `SendGridClient.request` returns the raw body (JSON, text or `undefined`); resource decoding drops unknown keys; and one failure in a batched `send` / `sendMany` window fails the whole window.

- [#34](https://github.com/thomasfosterau/effect-email/pull/34) [`c03d582`](https://github.com/thomasfosterau/effect-email/commit/c03d5820a314658f268b9615775260b9a041c6b8) Thanks [@thomasfosterau](https://github.com/thomasfosterau)! - Each package tarball ships `dist`, `src` (without tests), `README.md` and `LICENSE`; the README carries everything a consumer needs.

- [#35](https://github.com/thomasfosterau/effect-email/pull/35) [`66ed5cf`](https://github.com/thomasfosterau/effect-email/commit/66ed5cfc4a86e8ecdec236cc6fa44838ad8ff31c) Thanks [@thomasfosterau](https://github.com/thomasfosterau)! - Tested against effect 4.0.0; peer floor unchanged (`>=4.0.0-rc.118`).

- [#56](https://github.com/thomasfosterau/effect-email/pull/56) [`7c56d2d`](https://github.com/thomasfosterau/effect-email/commit/7c56d2d6c26b74552f0255d33ffdcb91069b2536) Thanks [@thomasfosterau](https://github.com/thomasfosterau)! - `layerConfig` builds when `SENDGRID_API_KEY` is empty, so a stage without a credential boots again, and every resource call then fails with `InvalidApiKeyError` before any request (a send: `EmailSendError` with that `cause`), as `layer({ apiKey })` with an empty key already did. Effect's `ConfigProvider` reads an empty variable as missing, so an unset `SENDGRID_API_KEY` builds the same way; a config source error still fails layer construction.

- [#51](https://github.com/thomasfosterau/effect-email/pull/51) [`cb327f3`](https://github.com/thomasfosterau/effect-email/commit/cb327f3bb968ff2a01b3e3d28bf296befa6d9659) Thanks [@thomasfosterau](https://github.com/thomasfosterau)! - The SendGrid client never follows a redirect and fails on every non-2xx, as the Resend provider does. It pins `redirect: "error"` on the underlying fetch, layered over any `FetchHttpClient.RequestInit` you provide, so a 3xx can never carry the bearer token to another host; a refused redirect fails as a transport `SendGridClientError` (`status: none`). A 3xx that reaches the client is now a `SendGridClientError` with `status: some(status)` (and a mail send an `EmailSendError`) rather than a success, and an error body that cannot be read still fails with the status.

- [#61](https://github.com/thomasfosterau/effect-email/pull/61) [`873bc10`](https://github.com/thomasfosterau/effect-email/commit/873bc106e3bf151a1b9ee998819ef6744cf5416f) Thanks [@thomasfosterau](https://github.com/thomasfosterau)! - `SendGridClient.request` / `requestJson` (and so every resource helper) only send to the configured host. A request `url` must be a path starting with a single `/` (`/v3/templates`); an absolute URL, a protocol-relative `//host` or a path without its leading `/` now fails with a `SendGridClientError` (`status: none`) before any request is made, so input that reaches `url` can never send the API key to another host. `SendGridConfig`'s `baseUrl` (`SENDGRID_BASE_URL`) remains the way to change host, as with the Resend provider; a `baseUrl` that is not an absolute `http:` / `https:` URL fails the same way.
- Updated dependencies [[`7d8ea4e`](https://github.com/thomasfosterau/effect-email/commit/7d8ea4ee126c1fa52d6399dda1e031455e8bcaa8), [`c03d582`](https://github.com/thomasfosterau/effect-email/commit/c03d5820a314658f268b9615775260b9a041c6b8), [`66ed5cf`](https://github.com/thomasfosterau/effect-email/commit/66ed5cfc4a86e8ecdec236cc6fa44838ad8ff31c), [`36ecd31`](https://github.com/thomasfosterau/effect-email/commit/36ecd31031998ebd38933aaececc64d383c18b80)]:
  - @thomasfosterau/effect-email@0.1.0
