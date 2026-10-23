---
"@thomasfosterau/effect-connect": minor
"@thomasfosterau/effect-connect-sendgrid": patch
"@thomasfosterau/effect-connect-resend": patch
"@thomasfosterau/effect-connect-twilio": patch
---

The core gains an `Http` module with the transport rules every provider applies over `effect/http`: `refuseRedirects` (pins `redirect: "error"` over the consumer's `FetchHttpClient.RequestInit`), `rejectionMessage` (a non-2xx as the status plus the truncated body), `describeHttpError`, `httpErrorStatus` and `isSuccessStatus`. The SendGrid, Resend and Twilio providers use them in place of their own copies; their behaviour and error messages are unchanged.
