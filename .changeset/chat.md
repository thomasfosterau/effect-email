---
"@thomasfosterau/effect-connect": minor
"@thomasfosterau/effect-connect-slack": minor
"@thomasfosterau/effect-connect-discord": minor
---

The core adds a chat channel beside email and SMS, as its own service:

- `ChatMessage` (`{ text, username? }`: non-empty text and an optional display-name override) and `ChatSendResult` as `effect/Schema` schemas.
- `ChatService` (`Context.Service`: `send`, `sendBatch`), the `sendChat` / `sendChatBatch` accessors and `ChatService.layerRecording(sent)`.
- `ChatSendError` / `ChatValidationError` (`Schema.TaggedError`) and `decodeChatMessage`.
- `executeWithSecretUrl` (with `SecretUrlRequestOptions`), `describeHttpErrorWithoutUrl` and `redactSecrets` in `Http`, for a provider whose request URL is the credential: Effect's own `HttpClientError` message names the request URL, so these compose every failure message without it.

Two chat providers (peer: `effect`; each depends on the core) post through incoming webhooks over `effect/http` with no SDK. In both, the webhook URL is the credential: it is `Redacted`, checked against the vendor's fixed host before any request (anything else fails with `ChatSendError`, `status: none`, and nothing is sent), and never put in an error message or log line. Both pin `redirect: "error"`, truncate error bodies, post a batch one message at a time in order, and ship `noop`, `resolveTransport(env)` / `configFromEnv`.

- `@thomasfosterau/effect-connect-slack`: `POST { text, username? }` to `https://hooks.slack.com/services/…`; `layer` / `layerConfig` (`SLACK_WEBHOOK_URL`), `webhookPath`, `toSlackPayload`. Slack answers `ok`, so results carry `id: none`.
- `@thomasfosterau/effect-connect-discord`: `POST { content, username? }` to `https://discord.com/api/webhooks/{id}/{token}?wait=true`, so results carry Discord's message id; `layer` / `layerConfig` (`DISCORD_WEBHOOK_URL`), `parseWebhookUrl`, `toDiscordPayload`, and text over `DISCORD_CONTENT_LIMIT` (2000) refused before any request.
