---
"@thomasfosterau/effect-email": patch
"@thomasfosterau/effect-email-sendgrid": patch
"@thomasfosterau/effect-email-resend": patch
---

Doc comments now match the code: `layerConfig` in both providers documents that it fails at layer construction with a `ConfigError` on an unset or empty API key variable; SendGrid's `InvalidApiKeyError` applies only to `layer({ apiKey })`; `SendGridClientError` covers 4xx/5xx (a 3xx is returned as a response) and schema mismatches; `SendGridClient.request` returns the raw body (JSON, text or `undefined`); resource decoding drops unknown keys; and the batched `send` / `sendMany` document that one failure fails the whole batch window.
