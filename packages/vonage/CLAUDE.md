# @thomasfosterau/effect-connect-vonage

The Vonage SMS provider: the Messages API's `POST /v1/messages` (JSON, `message_type: "text"`, `channel: "sms"`) over `effect/http`, no SDK. Implements the core `SmsService`; shaped after the Twilio provider (`noop` + `resolveTransport(env)`).

## Boundary

Imports the core only (`.fallowrc.json` zone `vonage`, allowed: `core`). Never imports another provider package.

## Invariants

- **Fixed literal host and path.** `DEFAULT_BASE_URL` is a compile-time constant and the path is the literal `/v1/messages`; `baseUrl` exists for a stub server, never for request input (SEC-SSRF-001 in the apps). No configured value is interpolated into the path.
- **The credential is HTTP Basic auth in the header** (API key as username, API secret as password), never in the JSON body.
- **`redirect: "error"`** (the core's `refuseRedirects`) on the underlying fetch, layered over the consumer's own `FetchHttpClient.RequestInit` (only `redirect` is pinned), so a 3xx never replays the Basic credential (SEC-SECRET-001).
- **A non-2xx fails with the status and a truncated body** (the core's `rejectionMessage`); an unreadable body still fails with the status; the secret never appears in a message.
- **Numbers go out without the leading `+`.** Vonage takes E.164 digits only (`toVonageNumber`); an alphanumeric sender ID or a short code passes through unchanged.
- **The SMS body and the recipient number never reach a log line or an error message we compose.** An SMS is very often a one-time code. A vendor error body is truncated, not scrubbed.
- **No retry.** The caller decides the policy.
- **No sender, no request.** `toVonagePayload` is `none` when neither the message's `from` nor the configured `from` is set; the send fails before any request.
- **`sendBatch` is one request per message**, `BATCH_CONCURRENCY` (4) in flight, failing on the first failure: the Messages API has no batch endpoint.
- **The no-op succeeds and logs one fixed line.** Safe only while the SMS is advisory.

## Terms

- **Config** — `VonageConfig` (`apiKey`, `apiSecret`, `from`, `baseUrl`), with `layer` (literal) and `layerConfig` (`VONAGE_API_KEY`, `VONAGE_API_SECRET`, optional `VONAGE_FROM` / `VONAGE_BASE_URL`).
- **Payload** — `VonageMessagePayload` (`message_type`, `channel`, `to`, `from`, `text`), produced by `toVonagePayload(message, defaultFrom)`.
- **Result** — the 202 body's `message_uuid`, answered as `SmsSendResult.id`.
- **noop** — the `SmsService` that succeeds without sending.
- **Resolver** — `resolveTransport(env)`: the live layer over `FetchHttpClient` when `configFromEnv(env)` finds a non-blank API key and secret, `noop` otherwise.
