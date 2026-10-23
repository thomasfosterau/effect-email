# @thomasfosterau/effect-connect-discord

The Discord chat provider: Execute Webhook (`POST` JSON `{ content, username? }` to `https://discord.com/api/webhooks/{id}/{token}?wait=true`) over `effect/http`, no SDK. Implements the core `ChatService`; shaped after the Twilio provider (`noop` + `resolveTransport(env)`).

## Boundary

Imports the core only (`.fallowrc.json` zone `discord`, allowed: `core`). Never imports another provider package.

## Invariants

- **The webhook URL is the credential.** It is `Redacted` in config and env, and never reaches a log line or an error message: the request runs through the core's `executeWithSecretUrl` (Effect's own `HttpClientError` message names the request URL), which composes every failure message without it and redacts the URL, its path and its token from vendor and transport text, and no `ChatSendError` carries a `cause` (a `HttpClientError` holds the request).
- **The URL is checked before any request** (`parseWebhookUrl`): `https:`, exactly `discord.com` or `discordapp.com`, no port, userinfo, query or fragment, an `/api[/v<n>]/webhooks/<numeric id>/<token>` path. Anything else fails the send with `ChatSendError` (`status: none`) and makes no request.
- **Fixed literal origin.** The request goes to `DEFAULT_BASE_URL` (`https://discord.com`, whichever spelling the URL used) plus the checked path. `baseUrl` replaces only that origin, for a stub server, never for request input; there is no env variable for it.
- **`wait=true` on every send**, so Discord answers the created message and the result carries its `id`. A 2xx body without an `id` fails the send.
- **`DISCORD_CONTENT_LIMIT` (2000) is checked before any request**, in code points; Discord's verdict stands for anything it lets through.
- **`redirect: "error"`** (the core's `refuseRedirects`, inside `executeWithSecretUrl`) on the underlying fetch, layered over the consumer's own `FetchHttpClient.RequestInit`.
- **A non-2xx fails with the status and a truncated body** (the core's `rejectionMessage`, inside `executeWithSecretUrl`), redacted; an unreadable body still fails with the status.
- **The message text never reaches a log line or an error message we compose.**
- **No retry.** The caller decides the policy (a 429's `retry_after` is in the truncated body).
- **`sendBatch` is sequential** (concurrency 1) so the channel shows messages in order, and fails on the first failure.
- **The no-op succeeds and logs one fixed line.** Safe only while the chat message is advisory.

## Terms

- **Config** — `DiscordConfig` (`webhookUrl`, `baseUrl`), with `layer` (literal) and `layerConfig` (`DISCORD_WEBHOOK_URL`, redacted).
- **Webhook** — `DiscordWebhook` (`path`, `token`), what `parseWebhookUrl` answers for a valid URL.
- **Payload** — `DiscordWebhookPayload` (`content`, `username?`), produced by `toDiscordPayload(message)`.
- **noop** — the `ChatService` that succeeds without sending.
- **Resolver** — `resolveTransport(env)`: the live layer over `FetchHttpClient` when `configFromEnv(env)` finds a non-blank `DISCORD_WEBHOOK_URL`, `noop` otherwise.
