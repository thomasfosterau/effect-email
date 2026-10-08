---
"@thomasfosterau/effect-email": patch
"@thomasfosterau/effect-email-sendgrid": patch
"@thomasfosterau/effect-email-resend": patch
---

Doc comments state each provider's failure modes: `layerConfig` fails at layer construction with a `ConfigError` on an unset or empty API key variable; SendGrid's `InvalidApiKeyError` comes from `layer({ apiKey })` with a blank key; `SendGridClientError` covers error answers and schema mismatches; `SendGridClient.request` returns the raw body (JSON, text or `undefined`); resource decoding drops unknown keys; and one failure in a batched `send` / `sendMany` window fails the whole window.
