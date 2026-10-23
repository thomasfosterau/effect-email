---
"@thomasfosterau/effect-connect-sendgrid": patch
---

The SendGrid client never follows a redirect and fails on every non-2xx, as the Resend provider does. It pins `redirect: "error"` on the underlying fetch, layered over any `FetchHttpClient.RequestInit` you provide, so a 3xx can never carry the bearer token to another host; a refused redirect fails as a transport `SendGridClientError` (`status: none`). A 3xx that reaches the client is now a `SendGridClientError` with `status: some(status)` (and a mail send an `EmailSendError`) rather than a success, and an error body that cannot be read still fails with the status.
