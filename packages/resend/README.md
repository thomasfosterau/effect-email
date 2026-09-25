# `@thomasfosterau/effect-email-resend`

The Resend provider for [`@thomasfosterau/effect-email`](../core/README.md): `POST /emails` over Effect's `HttpClient` (`effect/unstable/http`) with no SDK, a `Redacted` API key, a no-op layer for un-provisioned stages and an env-driven resolver that picks between the two.

[![CI](https://github.com/thomasfosterau/effect-email/actions/workflows/ci.yml/badge.svg)](https://github.com/thomasfosterau/effect-email/actions/workflows/ci.yml) [![npm version](https://img.shields.io/npm/v/@thomasfosterau/effect-email-resend.svg)](https://www.npmjs.com/package/@thomasfosterau/effect-email-resend) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Disclaimer:** This repository and package have been created using Claude Code. The package's API and functionality is in flux, so expect churn and breaking changes.

## Installation

```bash
npm install @thomasfosterau/effect-email-resend @thomasfosterau/effect-email effect
```

`effect` (`>=4.0.0-rc.115`) is a peer dependency. Node.js 22 or newer is required. Nothing here is Node-shaped: the provider runs on Cloudflare Workers and in browsers as well as on Node.

## Quick start

```ts
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import { FetchHttpClient } from "effect/unstable/http";
import { EmailService } from "@thomasfosterau/effect-email";
import * as Resend from "@thomasfosterau/effect-email-resend";

const EmailLive = Resend.layer({ apiKey: Redacted.make(process.env.RESEND_API_KEY!) }).pipe(
  Layer.provide(FetchHttpClient.layer),
);

const program = Effect.gen(function* () {
  const email = yield* EmailService;
  const result = yield* email.send({
    from: { email: "noreply@example.com", name: "Example" },
    to: [{ email: "reader@example.com" }],
    subject: "Welcome",
    text: "Welcome aboard.",
    html: "<p>Welcome aboard.</p>",
  });
  // result.id is Resend's email id, as an Option (always `some` here)
});
```

`Resend.layerConfig` reads `RESEND_API_KEY` (and an optional `RESEND_BASE_URL`) through `effect/Config` instead.

## On a Worker: `resolveTransport(env)`

The consuming applications' preview and dev stages deploy without the credential. `resolveTransport` is the one call a Worker makes: the live sender on the platform `fetch` when `RESEND_API_KEY` is bound and non-blank (as a string or a `Redacted`), the logging no-op otherwise, so the fallback cannot be forgotten.

```ts
import * as Resend from "@thomasfosterau/effect-email-resend";

export default {
  fetch: (request: Request, env: Env) =>
    handle(request).pipe(Effect.provide(Resend.resolveTransport(env)), Effect.runPromise),
};
```

`Resend.noop` succeeds without sending and logs the subject only — never the recipient, never the body (a verification URL is the token). That trade is only safe while the mail is advisory; a send that gates an account should fail loudly at boot instead.

## What the transport pins

- **A fixed literal host.** `https://api.resend.com` is a compile-time constant; `baseUrl` exists for a stub server in a test, never for request input.
- **`redirect: "error"`** on the underlying fetch, layered over any `FetchHttpClient.RequestInit` defaults you provide. Workers' default (`follow`) replays a request at the redirect target with the headers intact, so a 3xx from a hijacked host would hand the bearer token to whatever host the response named. A Resend send has no legitimate reason to redirect.
- **Truncated error bodies.** A non-2xx becomes an `EmailSendError` with `provider: "resend"`, `status: some(status)` and at most 200 characters of the response; an unreadable body still fails with the status; a transport failure carries `status: none`. The key never appears in a message.
- **No retry.** The caller decides the policy (`Effect.retry`).

## Batches

`sendBatch(messages)` is one `POST /emails/batch`, one result per message in order. Resend accepts up to 100 messages per request; chunk beyond that. An empty batch makes no request.

## Message mapping

| Core `EmailMessage`                  | Resend `POST /emails`                      |
| ------------------------------------ | ------------------------------------------ |
| `from`, `to`, `cc`, `bcc`            | `Name <address>` strings (`formatAddress`) |
| `replyTo`                            | `reply_to: [address]`                      |
| `subject`, `text`, `html`, `headers` | the same                                   |
| `attachments`                        | `attachments` (`content_type`)             |
| `tags`                               | `tags: [{ name: tag, value: tag }]`        |

`toResendPayload(message)` is exported for callers that want to inspect the payload.

## Testing a consumer

Provide `EmailService.layerRecording(sent)` from the core. To exercise this package's own transport, provide `FetchHttpClient.layer` with a stub `Fetch`:

```ts
import * as Layer from "effect/Layer";
import { FetchHttpClient } from "effect/unstable/http";

const http = FetchHttpClient.layer.pipe(
  Layer.provide(Layer.succeed(FetchHttpClient.Fetch, stubFetch)),
);
const EmailStub = Resend.layer({ apiKey: Redacted.make("re_test") }).pipe(Layer.provide(http));
```

## License

MIT
