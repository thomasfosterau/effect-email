# `@thomasfosterau/effect-email-sendgrid`

The SendGrid provider for [`@thomasfosterau/effect-email`](../core/README.md): the core `EmailService` over SendGrid's v3 Mail Send API with request batching, plus a typed client for the Templates, Marketing Contacts, API Keys and User Profile resources. HTTP goes through Effect's `HttpClient` (`effect/http`); there is no SDK.

[![CI](https://github.com/thomasfosterau/effect-email/actions/workflows/ci.yml/badge.svg)](https://github.com/thomasfosterau/effect-email/actions/workflows/ci.yml) [![npm version](https://img.shields.io/npm/v/@thomasfosterau/effect-email-sendgrid.svg)](https://www.npmjs.com/package/@thomasfosterau/effect-email-sendgrid) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Disclaimer:** This repository and package have been created using Claude Code. The package's API and functionality is in flux, so expect churn and breaking changes.

This package absorbs the former `thomasfosterau/effect-sendgrid` wrapper: the same surface (mail send, the batched request resolver, the generic `request` seam, the resource helpers) ported from `@sendgrid/mail` / `@sendgrid/client` onto Effect's own HTTP client and the shared core message model.

## Installation

```bash
npm install @thomasfosterau/effect-email-sendgrid @thomasfosterau/effect-email effect
```

`effect` (`>=4.0.0-rc.118`) is a peer dependency. Node.js 22 or newer is required.

## Quick start

```ts
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import { FetchHttpClient } from "effect/http";
import { EmailService } from "@thomasfosterau/effect-email";
import * as SendGrid from "@thomasfosterau/effect-email-sendgrid";

const EmailLive = SendGrid.layer({ apiKey: Redacted.make(process.env.SENDGRID_API_KEY!) }).pipe(
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
  // result.id is SendGrid's X-Message-Id, as an Option
});

Effect.runPromise(program.pipe(Effect.provide(EmailLive)));
```

`SendGrid.layerConfig` reads `SENDGRID_API_KEY` (and an optional `SENDGRID_BASE_URL`, e.g. `https://api.eu.sendgrid.com`) through `effect/Config` instead.

## Batched sends

`SendGrid.send(message)` goes through a `RequestResolver`: concurrent sends in the same batch window reach the `EmailService` as one `sendBatch` call.

```ts
const results =
  yield * Effect.all([SendGrid.send(a), SendGrid.send(b)], { concurrency: "unbounded" });
// or
const results = yield * SendGrid.sendMany([a, b, c]);
```

SendGrid's mail-send endpoint takes one message per request, so `sendBatch` sends them concurrently (bounded); the batching buys one service call, not one HTTP request.

## The generic client and the resource helpers

```ts
import * as SendGrid from "@thomasfosterau/effect-email-sendgrid";

const templates = yield * SendGrid.Template.list({ generations: "dynamic" });
templates.body.result[0].name;

yield * SendGrid.Contact.upsert([{ email: "reader@example.com", first_name: "Reader" }]);
const key = yield * SendGrid.ApiKey.create({ name: "worker", scopes: ["mail.send"] });
const profile = yield * SendGrid.UserProfile.get();

// Anything else on the v3 API:
const raw =
  yield * SendGrid.request({ url: "/v3/stats", method: "GET", qs: { start_date: "2026-01-01" } });
raw.status;
raw.body;
raw.headers;
const typed = yield * SendGrid.requestJson(MySchema)({ url: "/v3/stats", method: "GET" });
```

Every helper requires `SendGrid.SendGridClient`, which `SendGrid.layer` / `layerConfig` provide alongside the `EmailService`.

## Errors

| Error | When |
| --- | --- |
| `EmailSendError` (core) | A mail send failed. `provider: "sendgrid"`, `status: Option<number>`, the SendGrid error as `cause`. |
| `SendGridClientError` | A client request failed: `status: some(status)` and a truncated upstream body on a non-2xx, `status: none` for a transport failure or an unexpected response shape. |
| `InvalidApiKeyError` | The configured key is blank. Raised at call time, not at layer construction, so a stage without a credential still boots. |

The credential never appears in an error message; a vendor error body is truncated to 200 characters before it is embedded.

## Message mapping

| Core `EmailMessage` | SendGrid `POST /v3/mail/send`                    |
| ------------------- | ------------------------------------------------ |
| `from`, `replyTo`   | `from`, `reply_to`                               |
| `to`, `cc`, `bcc`   | one `personalizations[0]` entry                  |
| `text`, `html`      | `content` (`text/plain` first, then `text/html`) |
| `attachments`       | `attachments` with `disposition: "attachment"`   |
| `headers`           | `headers`                                        |
| `tags`              | `categories`                                     |

`toMailSendPayload(message)` is exported for callers that want to inspect or extend the payload (a dynamic-template send adds `template_id` and per-personalization `dynamic_template_data` through `SendGrid.request` directly).

## Testing a consumer

Provide `EmailService.layerRecording(sent)` from the core instead of this layer; nothing here needs to be stubbed. To exercise this package's own mapping, stand in an `HttpClient` (`HttpClient.make`) or a `FetchHttpClient.Fetch` stub.

## License

MIT
