# @thomasfosterau/effect-email-resend

The Resend provider: `POST /emails` (and `/emails/batch`) over `effect/http`, no SDK. The library form of the hand-rolled senders in the website, gardeneria and preferenceflow applications (`apps/auth/src/email.ts`, gardeneria's `packages/jobs/src/email/transport.ts`); preferenceflow's factoring (`noopEmailTransport` + `resolveEmailTransport(env)`) is the reference.

## Boundary

Imports the core only (`.fallowrc.json` zone `resend`, allowed: `core`). Never imports `packages/sendgrid`.

## Invariants

- **Fixed literal host.** `DEFAULT_BASE_URL` is a compile-time constant; `baseUrl` exists for a stub server, never for request input (SEC-SSRF-001 in the apps).
- **`redirect: "error"`** on the underlying fetch, layered over the consumer's own `FetchHttpClient.RequestInit` (only `redirect` is pinned). A 3xx from a hijacked `api.resend.com` must never hand the bearer token to the host it names (SEC-SECRET-001).
- **A non-2xx fails with the status and a truncated body**; an unreadable body still fails with the status; the key never appears in a message.
- **No retry.** The caller decides the policy.
- **The no-op succeeds and logs the subject only** — never the recipient (PII), never the body (a verification URL _is_ the token). Every un-provisioned preview stage of the consuming apps runs on it. Safe only while the mail is advisory; a send that gates an account should fail loudly at boot instead.
- **`sendBatch` is one `POST /emails/batch`** (Resend's limit is 100 per request; the caller chunks beyond that); an empty batch makes no request.
- **`layerConfig` fails at construction on an empty `RESEND_API_KEY`**: rc.118's `ConfigProvider` reads an empty variable as missing. `resolveTransport(env)` is the path that tolerates a missing key.

## Terms

- **Config** — `ResendConfig` (`apiKey`, `baseUrl`), with `layer` (literal) and `layerConfig` (`RESEND_API_KEY` / `RESEND_BASE_URL`).
- **Payload** — `ResendSendPayload`, produced by `toResendPayload(message)`: recipients as `Name <address>` strings (`formatAddress`), `replyTo` as a one-element `reply_to`, core `tags` as `{ name: tag, value: tag }`.
- **noop** — the `EmailService` that succeeds without sending, logging the subject only.
- **Resolver** — `resolveTransport(env)`: the live layer over `FetchHttpClient` when `RESEND_API_KEY` is present and non-blank (`apiKeyFromEnv`), `noop` otherwise. Self-contained (no `HttpClient` requirement) because it is the one call a Worker makes.
