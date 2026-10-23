# @thomasfosterau/effect-connect-twilio

The Twilio SMS and WhatsApp provider: Programmable Messaging's `POST /2010-04-01/Accounts/{AccountSid}/Messages.json` (form-encoded) over `effect/http`, no SDK. Implements the core `SmsService` and `WhatsAppService` over the one resource; shaped after the Resend provider (`noop` + `resolveTransport(env)`, per channel).

## Boundary

Imports the core only (`.fallowrc.json` zone `twilio`, allowed: `core`). Never imports `packages/sendgrid` or `packages/resend`.

## Invariants

- **Fixed literal host.** `DEFAULT_BASE_URL` is a compile-time constant; `baseUrl` exists for a stub server, never for request input (SEC-SSRF-001 in the apps).
- **The account SID is validated before it reaches the URL path** (`AC` + 32 hex digits); anything else fails the send with the channel's send error and makes no request. It is the only configured value interpolated into the path.
- **One request path.** Both channels go through `makeSender` in `Twilio.ts` (the account-SID guard, the sender check, the POST, the error mapping); a channel supplies only its params mapping, its no-sender message and its error constructor. A transport rule added for one channel applies to both.
- **`redirect: "error"`** (the core's `refuseRedirects`) on the underlying fetch, layered over the consumer's own `FetchHttpClient.RequestInit` (only `redirect` is pinned), so a 3xx never replays the Basic credential (SEC-SECRET-001).
- **A non-2xx fails with the status and a truncated body** (the core's `rejectionMessage`); an unreadable body still fails with the status; the token never appears in a message.
- **The message body, a template's variables and the recipient number never reach a log line or an error message we compose.** An SMS or a WhatsApp template is very often a one-time code. A vendor error body is truncated, not scrubbed.
- **No retry.** The caller decides the policy.
- **No sender, no request.** `toTwilioParams` is `none` when neither the message's `from`, the configured `from` nor a Messaging Service is set; `toTwilioWhatsAppParams` likewise over `whatsappFrom`. The send fails before any request.
- **WhatsApp never reuses the SMS `from`.** An SMS sender may be an alphanumeric ID or a short code, which is not a WhatsApp number; WhatsApp falls back on `whatsappFrom` only. The Messaging Service is shared: Twilio routes a `whatsapp:` recipient to a WhatsApp sender in the service's pool, and rejects the send when the pool has none.
- **`sendBatch` is one request per message**, `BATCH_CONCURRENCY` (4) in flight, failing on the first failure: Twilio has no batch endpoint.
- **The no-ops succeed and log one fixed line per message.** Safe only while the message is advisory.

## Terms

- **Config** — `TwilioConfig` (`accountSid`, `username`, `authToken`, `from`, `whatsappFrom`, `messagingServiceSid`, `baseUrl`), with `layer` (literal) and `layerConfig` (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, optional `TWILIO_API_KEY_SID` / `TWILIO_FROM` / `TWILIO_WHATSAPP_FROM` / `TWILIO_MESSAGING_SERVICE_SID` / `TWILIO_BASE_URL`). `username` is the API key SID when set, else the account SID; `authToken` is the matching secret.
- **Params** — `TwilioMessageParams` (`To`, `Body`, `From?`, `MessagingServiceSid?`), produced by `toTwilioParams(message, defaults)`; `TwilioWhatsAppParams` (`To` and `From?` prefixed `whatsapp:`, `MessagingServiceSid?`, and either `Body` or `ContentSid` + `ContentVariables?`, a JSON string), produced by `toTwilioWhatsAppParams(message, defaults)`.
- **noop / noopWhatsApp** — the `SmsService` / `WhatsAppService` that succeeds without sending.
- **Layers** — `layer(config)` / `layerConfig` provide exactly `SmsService`; `layerWhatsApp(config)` / `layerWhatsAppConfig` provide exactly `WhatsAppService`; `layerSmsService` / `layerWhatsAppService` take a `TwilioConfig` you provide.
- **Resolver** — `resolveTransport(env)`: the live layer over `FetchHttpClient` when `configFromEnv(env)` finds a non-blank account SID and token, `noop` otherwise; `resolveWhatsAppTransport(env)` likewise with `noopWhatsApp`.
