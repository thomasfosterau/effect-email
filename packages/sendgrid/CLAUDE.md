# @thomasfosterau/effect-connect-sendgrid

The SendGrid provider: the core `EmailService` over SendGrid's v3 Mail Send API, a batched `send`, and a typed client for four resources. No SDK — the former `thomasfosterau/effect-sendgrid` wrapper's `@sendgrid/mail` / `@sendgrid/client` are gone; HTTP is `effect/http`.

## Boundary

Imports the core only (`.fallowrc.json` zone `sendgrid`, allowed: `core`). Never imports `packages/resend`.

## Invariants

- **An empty API key builds and fails at call time** (`InvalidApiKeyError`), the posture the original suite pinned, through `layer` and `layerConfig` alike. Effect's `ConfigProvider` reads an empty variable as missing, so `layerConfig` defaults a missing `SENDGRID_API_KEY` to `""` (`Config.withDefault`) and an unset variable boots too; the two can't be told apart. `withDefault` replaces only absent data: a provider `SourceError` still fails construction (`tests/sendgrid.test.ts` pins each case).
- **The host is `baseUrl` and nothing else.** A `ClientRequest.url` is a path starting with a single `/`; an absolute URL, a protocol-relative `//host`, a bare segment (joined onto the base it becomes part of the host) or a `baseUrl` that is not an absolute `http:` / `https:` URL fails with a `SendGridClientError` (`status: none`) before the key check and before any request, and the joined URL must keep `baseUrl`'s origin. The scheme check is what makes the origin check bite: any other scheme has the opaque origin `"null"`, which every join shares (`file:` + `/\t/evil.test/x` parses as `file://evil.test/x`). The guarantee is the host, not `baseUrl`'s path prefix: a `/..` segment climbs above the prefix on the same host, so ids are interpolated with `encodeURIComponent`. `baseUrl` is configuration (the EU host, a stub server), never request input — the Resend provider's posture.
- **`redirect: "error"`** (the core's `refuseRedirects`) on the underlying fetch, layered over the consumer's own `FetchHttpClient.RequestInit` (only `redirect` is pinned), as the Resend provider does: a 3xx from a hijacked SendGrid host must never hand the bearer token to the host it names. A refused redirect is a transport failure.
- **A non-2xx is a `SendGridClientError` with `status: some(status)` and a truncated body** (the core's `rejectionMessage`), a 3xx included; an unreadable body still fails with the status; a transport failure carries `status: none`. The mail sender maps every client failure onto the core `EmailSendError` with `provider: "sendgrid"` and the original as `cause`.
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
