# @thomasfosterau/effect-connect

The provider-agnostic core: one message model and one service contract per channel — email (`Email.ts`, `EmailService.ts`) and SMS (`Sms.ts`, `SmsService.ts`) — their errors (`Errors.ts`), and the vendor-neutral transport rules every provider applies (`Http.ts`). Peer: `effect` only.

## Boundary

Imports nothing from this workspace (`.fallowrc.json` zone `core`, no outbound rule), and carries no provider vocabulary: providers depend on the core, never the reverse. HTTP code is allowed when it names no vendor (`Http.ts`).

## Invariants

- **`truncateUpstreamBody` (`UPSTREAM_BODY_LIMIT`) is the one helper** every provider uses to bound a vendor error body before it reaches `EmailSendError` / `SmsSendError` (the root `AGENTS.md` rule).
- **`status` is `Option<number>`**: `some` when the vendor answered with an error status, `none` for transport failures. Never a nullable.
- **One service per channel.** `EmailService` and `SmsService` are separate `Context.Service`s with the same shape (`send` + `sendBatch` + `layerRecording`), so a consumer's requirements name exactly the channels it uses. A new channel follows `Sms.ts` / `SmsService.ts`: a model module, a service module, a `<Channel>SendError` and `<Channel>ValidationError` in `Errors.ts`, a `decode<Channel>Message` built on `internal/issues.ts`'s `issueLines`. Top-level accessors carry the channel name (`sendSms`); the email ones (`send`, `sendBatch`) predate the rename and stay.
- **`internal/` is not public API.** It is not re-exported from `index.ts` and docgen excludes it (`docgen.json`).
- **Providers speak `effect/http`, through `Http.ts`.** A provider's layer requires `HttpClient.HttpClient`. Every provider runs its requests through `refuseRedirects` (`redirect: "error"` layered over the consumer's `FetchHttpClient.RequestInit`), builds a non-2xx message with `rejectionMessage` (status plus the truncated body; an unreadable body leaves the status) and a transport failure's with `describeHttpError` / `httpErrorStatus`. A new transport rule goes here, not into one provider.
- **The core message stays reconcilable with effect-auth** (a note, not a dependency in either direction). `@thomasfosterau/effect-auth`'s `EmailSender` takes a purpose-keyed `{ to, purpose, params }`; `EmailMessage` is its rendered form. An effect-auth adapter on a provider from here is `render(purpose, params) → { subject, text, html }` plus one `EmailService.send({ from, to: [{ email: to }], subject, text, html })`, mapping `EmailSendError` onto `AuthError` with the original as `cause`.

## Terms

- **Message** — `EmailMessage`, the one shape every provider sends: `from` / `to` / `cc` / `bcc` / `replyTo` recipients, `subject`, `text` / `html`, `attachments`, `headers`, `tags`.
- **Recipient** — `{ email, name? }`. The name key is `optionalKey`, never `optional`: an absent name stays absent, so a provider never serialises `"name": null`.
- **Result** — `EmailSendResult`, `{ id: Option<string> }`: the provider's message id when it gives one.
- **Contract** — `EmailService` (`Context.Service`), `send` + `sendBatch`, failing `EmailSendError` only.
- **Boundary decoder** — `decodeEmailMessage(unknown)` → `EmailValidationError`, for messages assembled from untrusted input. The typed `send` needs no validation.
- **Recording layer** — `EmailService.layerRecording(sent)`, the test double for the providers' suites and consumers.
- **SMS message** — `SmsMessage`, `{ to: PhoneNumber, from?: SmsSender, body }`: one recipient (E.164), a non-empty body, and an optional sender that overrides the provider's configured default. `SmsSender` is an E.164 number, a short code or an alphanumeric sender ID (≤ 11 characters); which a country accepts is the carrier's verdict.
- **SMS result / contract / decoder / recording layer** — `SmsSendResult` (`{ id: Option<string> }`), `SmsService` failing `SmsSendError` only, `decodeSmsMessage(unknown)` → `SmsValidationError`, `SmsService.layerRecording(sent)`.
