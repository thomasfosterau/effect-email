# packages/sendgrid — `@thomasfosterau/effect-email-sendgrid`

The SendGrid provider: the core `EmailService` over SendGrid's v3 Mail Send API, a batched `send`, and a typed client for four resources. Peer: `effect`; dependency: `@thomasfosterau/effect-email`. No SDK — the former `thomasfosterau/effect-sendgrid` wrapper's `@sendgrid/mail` / `@sendgrid/client` are gone; HTTP is `effect/unstable/http`.

## Terms

- **Client** — `SendGridClient`, the one `request` seam (`request` → raw JSON body, `requestJson(schema)` → decoded) every resource helper and the mail sender go through. Sets the bearer token from the `Redacted` key on every request.
- **Config** — `SendGridConfig` (`apiKey`, `baseUrl`), with `layer` (literal) and `layerConfig` (`SENDGRID_API_KEY` / `SENDGRID_BASE_URL`).
- **Mail payload** — `MailSendPayload`, `POST /v3/mail/send`'s body, produced by `toMailSendPayload(message)`: one personalization (`to` / `cc` / `bcc`), `text` then `html` as `content`, core `tags` as `categories`.
- **Batched send** — `send(message)` is an `Effect.request` through `SendEmailRequest` and a grouped `RequestResolver`: every send collected in one batch window becomes one `sendBatch` call on the `EmailService` in context. `sendMany` batches a list.
- **Resources** — `Template`, `Contact`, `ApiKey`, `UserProfile`: plain objects of functions over `requestJson` with the resource's `effect/Schema`.

## Local invariants

- **An empty API key builds the layer and fails at call time** (`InvalidApiKeyError`), the posture the original suite pinned, so a stage without a credential still boots.
- **A non-2xx is a `SendGridClientError` with `status: some(status)` and a truncated body**; a transport failure carries `status: none`. The mail sender maps both onto the core `EmailSendError` with `provider: "sendgrid"` and the original as `cause`.
- **`sendBatch` is one request per message**, bounded concurrency — SendGrid's endpoint takes one message per request. The batching the resolver buys is one service call, not one HTTP request.
- **Resource helpers are objects, not `namespace`s** (`erasableSyntaxOnly`).
- **Optional payload members are `Schema.optional`**, so the mapping can assign `undefined` and JSON encoding drops the key.

## Boundary

Imports the core only (`.fallowrc.json` zone `sendgrid`, allowed: `core`). Never imports `packages/resend`.
