# packages/core — `@thomasfosterau/effect-email`

The provider-agnostic core. Peer: `effect` only. No HTTP code, no provider vocabulary.

## Terms

- **Message** — `EmailMessage`, the one shape every provider sends: `from` / `to` / `cc` / `bcc` / `replyTo` recipients, `subject`, `text` / `html`, `attachments`, `headers`, `tags`.
- **Recipient** — `{ email, name? }`. The name key is `optionalKey`, never `optional`: an absent name stays absent, so a provider never serialises `"name": null`.
- **Result** — `EmailSendResult`, `{ id: Option<string> }`: the provider's message id when it gives one.
- **Contract** — `EmailService` (`Context.Service`), `send` + `sendBatch`, failing `EmailSendError` only.
- **Boundary decoder** — `decodeEmailMessage(unknown)` → `EmailValidationError`, for messages assembled from untrusted input. The typed `send` needs no validation.
- **Recording layer** — `EmailService.layerRecording(sent)`, the test double for the providers' suites and consumers.

## Local invariants

- **`EmailSendError` carries a truncated vendor body** (`UPSTREAM_BODY_LIMIT`, 200 characters) and never the credential. `truncateUpstreamBody` is the one helper every provider uses for it.
- **`status` is `Option<number>`**: `some` when the vendor answered (any non-2xx), `none` for transport failures. Never a nullable.
- **Providers speak `effect/http`.** A provider's layer requires `HttpClient.HttpClient`; the core states that contract and ships none of the code.

## effect-auth reconciliation (note, not a dependency)

`@thomasfosterau/effect-auth`'s `EmailSender` contract is `{ send: ({ to, purpose, params }) => Effect<void, AuthError> }` — a purpose-keyed message the adapter renders. This core's message is the rendered form. An `effect-auth-resend`-style adapter built on `@thomasfosterau/effect-email-resend` is a `render(purpose, params) → { subject, text, html }` plus one `EmailService.send({ from, to: [{ email: to }], subject, text, html })`, mapping `EmailSendError` onto `AuthError` with the original as `cause`. Nothing here depends on effect-auth and nothing in effect-auth depends on this; the note exists so the two shapes stay reconcilable.

## Boundary

Imports nothing from this workspace (`.fallowrc.json` zone `core`, no outbound rule).
