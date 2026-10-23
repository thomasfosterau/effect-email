# @thomasfosterau/effect-connect-twilio

The Twilio SMS provider: Programmable Messaging's `POST /2010-04-01/Accounts/{AccountSid}/Messages.json` (form-encoded) over `effect/http`, no SDK. Implements the core `SmsService`; shaped after the Resend provider (`noop` + `resolveTransport(env)`).

## Boundary

Imports the core only (`.fallowrc.json` zone `twilio`, allowed: `core`). Never imports `packages/sendgrid` or `packages/resend`.

## Invariants

- **Fixed literal host.** `DEFAULT_BASE_URL` is a compile-time constant; `baseUrl` exists for a stub server, never for request input (SEC-SSRF-001 in the apps).
- **The account SID is validated before it reaches the URL path** (`AC` + 32 hex digits); anything else fails the send with `SmsSendError` and makes no request. It is the only configured value interpolated into the path.
- **`redirect: "error"`** on the underlying fetch, layered over the consumer's own `FetchHttpClient.RequestInit` (only `redirect` is pinned), so a 3xx never replays the Basic credential (SEC-SECRET-001).
- **A non-2xx fails with the status and a truncated body**; an unreadable body still fails with the status; the token never appears in a message.
- **The SMS body and the recipient number never reach a log line or an error message we compose.** An SMS is very often a one-time code. A vendor error body is truncated, not scrubbed.
- **No retry.** The caller decides the policy.
- **No sender, no request.** `toTwilioParams` is `none` when neither the message's `from`, the configured `from` nor a Messaging Service is set; the send fails before any request.
- **`sendBatch` is one request per message**, `BATCH_CONCURRENCY` (4) in flight, failing on the first failure: Twilio has no batch endpoint.
- **The no-op succeeds and logs one fixed line.** Safe only while the SMS is advisory.

## Terms

- **Config** — `TwilioConfig` (`accountSid`, `username`, `authToken`, `from`, `messagingServiceSid`, `baseUrl`), with `layer` (literal) and `layerConfig` (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, optional `TWILIO_API_KEY_SID` / `TWILIO_FROM` / `TWILIO_MESSAGING_SERVICE_SID` / `TWILIO_BASE_URL`). `username` is the API key SID when set, else the account SID; `authToken` is the matching secret.
- **Params** — `TwilioMessageParams` (`To`, `Body`, `From?`, `MessagingServiceSid?`), produced by `toTwilioParams(message, defaults)`.
- **noop** — the `SmsService` that succeeds without sending.
- **Resolver** — `resolveTransport(env)`: the live layer over `FetchHttpClient` when `configFromEnv(env)` finds a non-blank account SID and token, `noop` otherwise.
