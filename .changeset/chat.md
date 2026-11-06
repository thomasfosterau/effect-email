---
"@thomasfosterau/effect-connect": minor
---

The core adds a chat channel beside email and SMS, as its own service:

- `ChatMessage` (`{ text, username? }`: non-empty text and an optional display-name override) and `ChatSendResult` as `effect/Schema` schemas.
- `ChatService` (`Context.Service`: `send`, `sendBatch`), the `sendChat` / `sendChatBatch` accessors and `ChatService.layerRecording(sent)`.
- `ChatSendError` / `ChatValidationError` (`Schema.TaggedError`) and `decodeChatMessage`.
- `executeWithSecretUrl` (with `SecretUrlRequestOptions`), `describeHttpErrorWithoutUrl` and `redactSecrets` in `Http`, for a provider whose request URL is the credential: Effect's own `HttpClientError` message names the request URL, so these compose every failure message without it.
