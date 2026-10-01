# @thomasfosterau/effect-email

The provider-agnostic core: the message model, the `EmailService` contract and its errors. Peer: `effect` only.

## Boundary

Imports nothing from this workspace (`.fallowrc.json` zone `core`, no outbound rule), and carries no HTTP code and no provider vocabulary: providers depend on the core, never the reverse.

## Invariants

- **`truncateUpstreamBody` (`UPSTREAM_BODY_LIMIT`) is the one helper** every provider uses to bound a vendor error body before it reaches `EmailSendError` (the root `AGENTS.md` rule).
- **`status` is `Option<number>`**: `some` when the vendor answered with an error status, `none` for transport failures. Never a nullable.
- **Providers speak `effect/http`.** A provider's layer requires `HttpClient.HttpClient`; the core states that contract and ships none of the code.
- **The core message stays reconcilable with effect-auth** (a note, not a dependency in either direction). `@thomasfosterau/effect-auth`'s `EmailSender` takes a purpose-keyed `{ to, purpose, params }`; `EmailMessage` is its rendered form. An effect-auth adapter on a provider from here is `render(purpose, params) → { subject, text, html }` plus one `EmailService.send({ from, to: [{ email: to }], subject, text, html })`, mapping `EmailSendError` onto `AuthError` with the original as `cause`.

## Terms

- **Message** — `EmailMessage`, the one shape every provider sends: `from` / `to` / `cc` / `bcc` / `replyTo` recipients, `subject`, `text` / `html`, `attachments`, `headers`, `tags`.
- **Recipient** — `{ email, name? }`. The name key is `optionalKey`, never `optional`: an absent name stays absent, so a provider never serialises `"name": null`.
- **Result** — `EmailSendResult`, `{ id: Option<string> }`: the provider's message id when it gives one.
- **Contract** — `EmailService` (`Context.Service`), `send` + `sendBatch`, failing `EmailSendError` only.
- **Boundary decoder** — `decodeEmailMessage(unknown)` → `EmailValidationError`, for messages assembled from untrusted input. The typed `send` needs no validation.
- **Recording layer** — `EmailService.layerRecording(sent)`, the test double for the providers' suites and consumers.
