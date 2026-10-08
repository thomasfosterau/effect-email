---
"@thomasfosterau/effect-email-sendgrid": patch
---

`layerConfig` builds when `SENDGRID_API_KEY` is empty, so a stage without a credential boots again, and every resource call then fails with `InvalidApiKeyError` before any request (a send: `EmailSendError` with that `cause`), as `layer({ apiKey })` with an empty key already did. Effect's `ConfigProvider` reads an empty variable as missing, so an unset `SENDGRID_API_KEY` builds the same way; a config source error still fails layer construction.
