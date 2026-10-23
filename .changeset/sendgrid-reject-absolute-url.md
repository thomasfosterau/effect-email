---
"@thomasfosterau/effect-connect-sendgrid": patch
---

`SendGridClient.request` / `requestJson` (and so every resource helper) only send to the configured host. A request `url` must be a path starting with a single `/` (`/v3/templates`); an absolute URL, a protocol-relative `//host` or a path without its leading `/` now fails with a `SendGridClientError` (`status: none`) before any request is made, so input that reaches `url` can never send the API key to another host. `SendGridConfig`'s `baseUrl` (`SENDGRID_BASE_URL`) remains the way to change host, as with the Resend provider; a `baseUrl` that is not an absolute `http:` / `https:` URL fails the same way.
