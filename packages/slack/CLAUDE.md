# @thomasfosterau/effect-connect-slack

The Slack chat provider: an incoming webhook (`POST` JSON `{ text, username? }` to `https://hooks.slack.com/services/…`) over `effect/http`, no SDK. Implements the core `ChatService`; shaped after the Twilio provider (`noop` + `resolveTransport(env)`).

## Boundary

Imports the core only (`.fallowrc.json` zone `slack`, allowed: `core`). Never imports another provider package.

## Invariants

- **The webhook URL is the credential.** It is `Redacted` in config and env, and never reaches a log line or an error message: the request runs through the core's `executeWithSecretUrl` (Effect's own `HttpClientError` message names the request URL), which composes every failure message without it and redacts the URL and its path from vendor and transport text, and no `ChatSendError` carries a `cause` (a `HttpClientError` holds the request).
- **The URL is checked before any request** (`webhookPath`): `https:`, exactly `hooks.slack.com`, no port, userinfo, query or fragment, a `/services/<a>/<b>/<c>` path. Anything else fails the send with `ChatSendError` (`status: none`) and makes no request.
- **Fixed literal origin.** The request goes to `DEFAULT_BASE_URL` plus the checked path. `baseUrl` replaces only that origin, for a stub server, never for request input; there is no env variable for it (an env that could move the origin could ship the token anywhere).
- **`redirect: "error"`** (the core's `refuseRedirects`, inside `executeWithSecretUrl`) on the underlying fetch, layered over the consumer's own `FetchHttpClient.RequestInit`.
- **A non-2xx fails with the status and a truncated body** (the core's `rejectionMessage`, inside `executeWithSecretUrl`), redacted; an unreadable body still fails with the status.
- **Success is any 2xx, with `id: none`.** Slack answers `200 ok` and no message id.
- **The message text never reaches a log line or an error message we compose.**
- **No retry.** The caller decides the policy.
- **`sendBatch` is sequential** (concurrency 1) so the channel shows messages in order, and fails on the first failure.
- **The no-op succeeds and logs one fixed line.** Safe only while the chat message is advisory.

## Terms

- **Config** — `SlackConfig` (`webhookUrl`, `baseUrl`), with `layer` (literal) and `layerConfig` (`SLACK_WEBHOOK_URL`, redacted).
- **Payload** — `SlackWebhookPayload` (`text`, `username?`), produced by `toSlackPayload(message)`. Slack honours `username` only on legacy custom-integration webhooks.
- **noop** — the `ChatService` that succeeds without sending.
- **Resolver** — `resolveTransport(env)`: the live layer over `FetchHttpClient` when `configFromEnv(env)` finds a non-blank `SLACK_WEBHOOK_URL`, `noop` otherwise.
