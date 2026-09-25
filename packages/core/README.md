# `@thomasfosterau/effect-email`

An Effect-native email abstraction: the message model, the `EmailService` contract and its errors, provider-agnostic. SendGrid and Resend providers ship as sibling packages.

[![CI](https://github.com/thomasfosterau/effect-email/actions/workflows/ci.yml/badge.svg)](https://github.com/thomasfosterau/effect-email/actions/workflows/ci.yml) [![npm version](https://img.shields.io/npm/v/@thomasfosterau/effect-email.svg)](https://www.npmjs.com/package/@thomasfosterau/effect-email) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Disclaimer:** This repository and package have been created using Claude Code. The package's API and functionality is in flux, so expect churn and breaking changes.

## Installation

```bash
npm install @thomasfosterau/effect-email effect
```

`effect` (`>=4.0.0-rc.115`) is a peer dependency, built against `effect@4.0.0-rc.115`. Node.js 22 or newer is required. Install a provider alongside it: [`@thomasfosterau/effect-email-sendgrid`](../sendgrid/README.md) or [`@thomasfosterau/effect-email-resend`](../resend/README.md).

## Overview

A consumer sends through the `EmailService` service and provides one provider's layer at the edge; swapping providers is a one-line layer change. Every provider talks HTTP through Effect's `HttpClient` (`effect/unstable/http`), so a test stands in a stub at that seam and nothing ever reaches a vendor from a unit suite.

| Export | What it is |
| --- | --- |
| `EmailAddress`, `Recipient`, `Attachment`, `EmailMessage`, `EmailSendResult` | The message model, as `effect/Schema` schemas with matching types. |
| `EmailService` | The `Context.Service`: `send(message)` and `sendBatch(messages)`, failing `EmailSendError`. `EmailService.layerRecording(sent)` is the test double. |
| `send`, `sendBatch` | Accessors over the service in context. |
| `decodeEmailMessage` | Decode untrusted input into a message, failing `EmailValidationError`. |
| `recipientAddresses` | Every address a message is delivered to (`to`, `cc`, `bcc`). |
| `EmailSendError`, `EmailValidationError` | The contract's errors (`Schema.TaggedError`). |
| `truncateUpstreamBody`, `UPSTREAM_BODY_LIMIT` | The bound a provider applies to a vendor error body before it can reach a log line. |

## Quick start

```ts
import * as Effect from "effect/Effect";
import { EmailService, type EmailMessage } from "@thomasfosterau/effect-email";

const welcome = (to: string): EmailMessage => ({
  from: { email: "noreply@example.com", name: "Example" },
  to: [{ email: to }],
  subject: "Welcome",
  text: "Welcome aboard.",
  html: "<p>Welcome aboard.</p>",
});

export const sendWelcome = (to: string) =>
  Effect.gen(function* () {
    const email = yield* EmailService;
    const result = yield* email.send(welcome(to));
    yield* Effect.log("sent", { id: result.id });
  });
```

Provide a provider at the edge:

```ts
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import { FetchHttpClient } from "effect/unstable/http";
import * as Resend from "@thomasfosterau/effect-email-resend";

const EmailLive = Resend.layer({
  apiKey: Redacted.make(env.RESEND_API_KEY),
  from: "Example <noreply@example.com>",
}).pipe(Layer.provide(FetchHttpClient.layer));
```

## Testing a consumer

```ts
import { EmailService, type EmailMessage } from "@thomasfosterau/effect-email";

const sent: Array<EmailMessage> = [];
const program = sendWelcome("reader@example.test").pipe(
  Effect.provide(EmailService.layerRecording(sent)),
);
// after running: sent[0].to[0].email === "reader@example.test"
```

## Errors

`EmailSendError` carries the provider name, a one-line `message` safe to log, the vendor's HTTP `status` as an `Option` (`none` for transport failures) and the underlying `cause`. The vendor's error body is truncated to 200 characters before it is embedded, and the credential never appears in one.

`EmailValidationError` is what `decodeEmailMessage` fails with; `issues` lists each schema issue as one line.

## Relationship to effect-auth

`@thomasfosterau/effect-auth`'s `EmailSender` takes a purpose-keyed message (`{ to, purpose, params }`) and lets an adapter render it. This package's `EmailMessage` is the rendered form, so an effect-auth adapter can be implemented on top of a provider from this repository: render, then `EmailService.send`. There is no dependency in either direction.

## License

MIT
