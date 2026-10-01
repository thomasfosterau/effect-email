# @thomasfosterau/effect-email-sendgrid

The SendGrid provider: the core `EmailService` over SendGrid's v3 Mail Send API, a batched `send`, and a typed client for four resources. No SDK — the former `thomasfosterau/effect-sendgrid` wrapper's `@sendgrid/mail` / `@sendgrid/client` are gone; HTTP is `effect/http`.

## Boundary

Imports the core only (`.fallowrc.json` zone `sendgrid`, allowed: `core`). Never imports `packages/resend`.

## Invariants

- **An empty API key passed to `layer` builds and fails at call time** (`InvalidApiKeyError`), the posture the original suite pinned. `layerConfig` differs: rc.118's `ConfigProvider` reads an empty `SENDGRID_API_KEY` as missing, so that layer fails at construction with a `ConfigError` (`tests/sendgrid.test.ts` pins both; effect-email#30 tracks restoring the boot-without-key posture).
- **A 4xx/5xx is a `SendGridClientError` with `status: some(status)` and a truncated body**; a transport failure carries `status: none`. Unlike the Resend provider, nothing pins `redirect`: fetch's default follows a 3xx, and a 3xx that does surface is returned as a success (effect-email#31). The mail sender maps every client failure onto the core `EmailSendError` with `provider: "sendgrid"` and the original as `cause`.
- **`sendBatch` is one request per message**, bounded concurrency (fail-fast) — SendGrid's endpoint takes one message per request. The batching the resolver buys is one service call, not one HTTP request.
- **A failed batch fails every `send` in its window**, including messages SendGrid had already accepted, so a retry can deliver duplicates.
- **Resource helpers are objects, not `namespace`s** (`erasableSyntaxOnly`).
- **Optional payload members are `Schema.optional`**, so the mapping can assign `undefined` and JSON encoding drops the key.

## Terms

- **Client** — `SendGridClient`, the one `request` seam (`request` → the raw body: parsed JSON, the text when it isn't JSON, `undefined` when empty; `requestJson(schema)` → decoded) every resource helper and the mail sender go through. Sets the bearer token from the `Redacted` key on every request.
- **Config** — `SendGridConfig` (`apiKey`, `baseUrl`), with `layer` (literal) and `layerConfig` (`SENDGRID_API_KEY` / `SENDGRID_BASE_URL`).
- **Mail payload** — `MailSendPayload`, `POST /v3/mail/send`'s body, produced by `toMailSendPayload(message)`: one personalization (`to` / `cc` / `bcc`), `text` then `html` as `content`, core `tags` as `categories`.
- **Batched send** — `send(message)` is an `Effect.request` through `SendEmailRequest` and a grouped `RequestResolver`: every send collected in one batch window becomes one `sendBatch` call on the `EmailService` in context. `sendMany` batches a list.
- **Resources** — `Template`, `Contact`, `ApiKey`, `UserProfile`: plain objects of functions over `requestJson` with the resource's `effect/Schema`.
