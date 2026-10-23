---
"@thomasfosterau/effect-connect-vonage": minor
---

`@thomasfosterau/effect-connect-vonage` (peer: `effect`; depends on the core) is a second SMS provider: the Vonage Messages API (`POST /v1/messages`, `channel: "sms"`) over `effect/http` with no SDK.

- `layer` / `layerConfig` (`VONAGE_API_KEY`, `VONAGE_API_SECRET`, optional `VONAGE_FROM`, `VONAGE_BASE_URL`) with a `Redacted` API secret sent as HTTP Basic auth, a default sender, `redirect: "error"` pinned on the fetch, and truncated error bodies. Numbers go out in Vonage's form (E.164 without the `+`). `sendBatch` sends one request per message, four at a time.
- `noop` (succeeds, logs neither the number nor the body) and `resolveTransport(env)` / `configFromEnv`; `toVonagePayload`, `toVonageNumber`, `VonageMessagePayload`.
